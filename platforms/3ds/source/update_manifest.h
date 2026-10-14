#pragma once
#include <stdint.h>
#include <stddef.h>
#define FORGE_MANIFEST_BYTES 316
#define FORGE_MANIFEST_BODY_BYTES 60
typedef struct { uint16_t version; uint32_t size; unsigned char sha256[32]; } ForgeManifest;
int forge_manifest_verify(const unsigned char *data, size_t size, const unsigned char *public_key, size_t key_size, uint64_t title_id, uint32_t max_size, ForgeManifest *out);
