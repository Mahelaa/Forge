#include "update_manifest.h"
#include <string.h>
#include <mbedtls/pk.h>
#include <mbedtls/sha256.h>
static uint32_t le32(const unsigned char *p) { return (uint32_t)p[0] | (uint32_t)p[1]<<8 | (uint32_t)p[2]<<16 | (uint32_t)p[3]<<24; }
static uint64_t le64(const unsigned char *p) { return (uint64_t)le32(p) | (uint64_t)le32(p+4)<<32; }
int forge_manifest_verify(const unsigned char *data, size_t size, const unsigned char *key, size_t key_size, uint64_t title_id, uint32_t max_size, ForgeManifest *out) {
    if (!data || !key || !out || size != FORGE_MANIFEST_BYTES || memcmp(data,"FORGE3DS",8) || le32(data+8)!=1 || le64(data+12)!=title_id || le32(data+20)>65535 || le32(data+24)<0x2020 || le32(data+24)>max_size) return -1;
    unsigned char digest[32];
    if (mbedtls_sha256_ret(data, FORGE_MANIFEST_BODY_BYTES, digest, 0)) return -2;
    mbedtls_pk_context pk; mbedtls_pk_init(&pk);
    int rc=mbedtls_pk_parse_public_key(&pk,key,key_size);
    if (!rc && (!mbedtls_pk_can_do(&pk,MBEDTLS_PK_RSA) || mbedtls_pk_get_bitlen(&pk)!=2048)) rc=-1;
    if (!rc) rc=mbedtls_pk_verify(&pk,MBEDTLS_MD_SHA256,digest,32,data+FORGE_MANIFEST_BODY_BYTES,256);
    mbedtls_pk_free(&pk); if(rc) return -2;
    out->version=(uint16_t)le32(data+20);out->size=le32(data+24);memcpy(out->sha256,data+28,32);return 0;
}
