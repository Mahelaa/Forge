#include "update.h"
#include "storage.h"
#include "update_manifest.h"
#include "update-trust.h"
#include <mbedtls/sha256.h>
#include <curl/curl.h>
#include <malloc.h>
#include <sys/stat.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define LOCAL_CIA "sdmc:/3ds/forge/update.cia.part"
#define FS_CIA "/3ds/forge/update.cia.part"
#define IO_BYTES 32768
#define SOC_BYTES (1024*1024)
static void *soc_buffer;
static LightLock lock;
static ForgeUpdateStatus status;
static ForgeManifest manifest;
static Thread worker;
static bool busy, cancel_requested;
static bool cancelled(void) { LightLock_Lock(&lock);bool value=cancel_requested;LightLock_Unlock(&lock);return value; }
static void report(ForgeUpdateState state,const char *text,Result error,unsigned percent) {
    LightLock_Lock(&lock);status.state=state;status.error=error;status.progress=percent;
    snprintf(status.message,sizeof(status.message),"%s",text);LightLock_Unlock(&lock);
}
void forge_update_snapshot(ForgeUpdateStatus *out) { LightLock_Lock(&lock);*out=status;LightLock_Unlock(&lock); }
void forge_update_cancel(void) { LightLock_Lock(&lock);cancel_requested=true;LightLock_Unlock(&lock); }
static Result network_begin(void) {
    soc_buffer=memalign(0x1000,SOC_BYTES);if(!soc_buffer)return -1;
    Result rc=socInit(soc_buffer,SOC_BYTES);if(R_FAILED(rc)){free(soc_buffer);soc_buffer=NULL;return rc;}
    rc=sslcInit(0);if(R_FAILED(rc)){socExit();free(soc_buffer);soc_buffer=NULL;return rc;}
    if(curl_global_init(CURL_GLOBAL_DEFAULT)!=CURLE_OK){sslcExit();socExit();free(soc_buffer);soc_buffer=NULL;return -1;}return 0;
}
static void network_end(void) { curl_global_cleanup();sslcExit();socExit();free(soc_buffer);soc_buffer=NULL; }
typedef struct { unsigned char *memory;FILE *file;mbedtls_sha256_context *sha;u32 total,expected; } Transfer;
static size_t write_download(char *data,size_t size,size_t count,void *argument) {
    Transfer *transfer=argument;if(size&&count>SIZE_MAX/size)return 0;size_t bytes=size*count;
    if(cancelled()||bytes>transfer->expected-transfer->total)return 0;
    if(transfer->file){if(fwrite(data,1,bytes,transfer->file)!=bytes||mbedtls_sha256_update_ret(transfer->sha,(unsigned char *)data,bytes))return 0;}
    else memcpy(transfer->memory+transfer->total,data,bytes);
    transfer->total+=bytes;
    if(transfer->file)report(UPDATE_DOWNLOADING,"Downloading update. B: cancel",0,transfer->total*100/transfer->expected);
    return bytes;
}
static int download_progress(void *argument,curl_off_t a,curl_off_t b,curl_off_t c,curl_off_t d) {
    (void)argument;(void)a;(void)b;(void)c;(void)d;return cancelled()?1:0;
}
static Result download(const char *url,Transfer *transfer) {
    CURL *curl=curl_easy_init();if(!curl)return -1;
    struct curl_blob ca={(void *)forge_update_root_pem,sizeof(forge_update_root_pem)-1,CURL_BLOB_NOCOPY};
    CURLcode options=CURLE_OK;
#define SET(option,value) do { if(options==CURLE_OK)options=curl_easy_setopt(curl,option,value); } while(0)
    SET(CURLOPT_URL,url);SET(CURLOPT_PROTOCOLS_STR,"https");SET(CURLOPT_FOLLOWLOCATION,0L);
    SET(CURLOPT_SSL_VERIFYPEER,1L);SET(CURLOPT_SSL_VERIFYHOST,2L);SET(CURLOPT_CAINFO_BLOB,&ca);
    SET(CURLOPT_SSLVERSION,CURL_SSLVERSION_TLSv1_2);SET(CURLOPT_HTTP_VERSION,CURL_HTTP_VERSION_1_1);
    SET(CURLOPT_CONNECTTIMEOUT,15L);SET(CURLOPT_TIMEOUT,300L);SET(CURLOPT_LOW_SPEED_LIMIT,1L);SET(CURLOPT_LOW_SPEED_TIME,15L);
    SET(CURLOPT_NOSIGNAL,1L);SET(CURLOPT_ACCEPT_ENCODING,"identity");SET(CURLOPT_USERAGENT,"Forge/" FORGE_VERSION);
    SET(CURLOPT_WRITEFUNCTION,write_download);SET(CURLOPT_WRITEDATA,transfer);
    SET(CURLOPT_NOPROGRESS,0L);SET(CURLOPT_XFERINFOFUNCTION,download_progress);
#undef SET
    CURLcode rc=options==CURLE_OK?curl_easy_perform(curl):options;
    long code=0;curl_off_t length=-1;
    curl_easy_getinfo(curl,CURLINFO_RESPONSE_CODE,&code);curl_easy_getinfo(curl,CURLINFO_CONTENT_LENGTH_DOWNLOAD_T,&length);
    curl_easy_cleanup(curl);
    if(rc!=CURLE_OK)return -(Result)rc;
    return code==200&&length==transfer->expected&&transfer->total==transfer->expected?0:-1;
}
static void check_release(void) {
    Result rc=network_begin();if(R_FAILED(rc)){report(UPDATE_ERROR,"Connect to Wi-Fi, then press X to retry.",rc,0);return;}
    unsigned char bytes[FORGE_MANIFEST_BYTES];Transfer transfer={.memory=bytes,.expected=sizeof(bytes)};
    rc=download(FORGE_UPDATE_ORIGIN "/api/updates/3ds/manifest.bin",&transfer);
    network_end();u32 total=transfer.total;
    if(cancelled()){report(UPDATE_CANCELLED,"Update check cancelled. Press X to retry.",0,0);return;}
    ForgeManifest candidate;
    if(R_FAILED(rc)||total!=sizeof(bytes)||forge_manifest_verify(bytes,total,forge_update_public_key,sizeof(forge_update_public_key),FORGE_TITLE_ID,FORGE_MAX_PACKAGE_BYTES,&candidate)){
        report(UPDATE_ERROR,"Update could not be verified. Press X to retry.",rc?rc:-1,0);return;
    }
    if(candidate.version<=FORGE_TITLE_VERSION){report(UPDATE_CURRENT,"Forge is up to date. X: check again",0,0);return;}
    LightLock_Lock(&lock);manifest=candidate;status.version=candidate.version;LightLock_Unlock(&lock);
    report(UPDATE_AVAILABLE,"A: install update    X: check again",0,0);
}
static void install_release(void) {
    ForgeManifest release;LightLock_Lock(&lock);release=manifest;LightLock_Unlock(&lock);
    Result rc=fsInit();bool fs_ready=R_SUCCEEDED(rc),mounted=false,network_ready=false,am_ready=false;
    FILE *file=NULL;Handle file_handle=0,install_handle=0;bool file_open=false,install_open=false;
    unsigned char *buffer=NULL;mbedtls_sha256_context sha;mbedtls_sha256_init(&sha);
    char space_message[96];
    const char *failure="Update failed. Press X to retry.";
    if(!fs_ready){failure="Could not access SD storage.";goto cleanup;}
    rc=archiveMountSdmc();mounted=R_SUCCEEDED(rc);if(!mounted){failure="Could not mount SD storage.";goto cleanup;}
    mkdir("sdmc:/3ds",0777);mkdir("sdmc:/3ds/forge",0777);
    file=fopen(LOCAL_CIA,"wb");if(!file){rc=-1;failure="Could not create update file.";goto cleanup;}
    buffer=malloc(IO_BYTES);if(!buffer){rc=-1;failure="Not enough memory for update.";goto cleanup;}
    char hash[65];for(unsigned i=0;i<32;i++)snprintf(hash+i*2,3,"%02x",release.sha256[i]);
    char url[256];snprintf(url,sizeof(url),FORGE_UPDATE_ORIGIN "/api/updates/3ds/packages/%s.cia",hash);
    rc=network_begin();network_ready=R_SUCCEEDED(rc);if(!network_ready)goto cleanup;
    rc=mbedtls_sha256_starts_ret(&sha,0);if(R_FAILED(rc))goto cleanup;
    Transfer transfer={.file=file,.sha=&sha,.expected=release.size};rc=download(url,&transfer);
    network_end();network_ready=false;
    if(cancelled()||R_FAILED(rc))goto cleanup;
    unsigned char digest[32];rc=mbedtls_sha256_finish_ret(&sha,digest);
    if(R_FAILED(rc)||memcmp(digest,release.sha256,32)){rc=-1;failure="Download verification failed.";goto cleanup;}
    if(fflush(file)){rc=-1;goto cleanup;}if(fclose(file)){file=NULL;rc=-1;goto cleanup;}file=NULL;
    rc=amInit();am_ready=R_SUCCEEDED(rc);if(!am_ready){failure="CIA installation service unavailable.";goto cleanup;}
    rc=FSUSER_OpenFileDirectly(&file_handle,ARCHIVE_SDMC,fsMakePath(PATH_EMPTY,""),fsMakePath(PATH_ASCII,FS_CIA),FS_OPEN_READ,0);
    file_open=R_SUCCEEDED(rc);if(!file_open)goto cleanup;
    AM_TitleInfo info;rc=AM_GetCiaFileInfo(MEDIATYPE_SD,&info,file_handle);
    if(R_FAILED(rc)){failure="Could not read CIA title information.";goto cleanup;}
    if(info.titleID!=FORGE_TITLE_ID||info.version!=release.version){rc=-1;failure="Package is not a matching Forge update.";goto cleanup;}
    u64 required=0,free_bytes=0;
    rc=AM_GetCiaRequiredSpace(&required,MEDIATYPE_SD,file_handle);
    if(R_FAILED(rc)){failure="Could not read installation space requirement.";goto cleanup;}
    FS_ArchiveResource resource={0};rc=FSUSER_GetSdmcArchiveResource(&resource);
    if(R_FAILED(rc)){failure="Could not read SD capacity.";goto cleanup;}
    if(forge_sd_free_bytes(resource.clusterSize,resource.totalClusters,resource.freeClusters,&free_bytes)){
        rc=-1;failure="SD capacity information is invalid.";goto cleanup;
    }
    if(required>free_bytes){
        rc=-1;snprintf(space_message,sizeof(space_message),"Not enough SD space. Need %llu KiB; free %llu MiB.",(unsigned long long)(required/1024+(required%1024!=0)),(unsigned long long)(free_bytes/(1024*1024)));
        failure=space_message;goto cleanup;
    }
    if(cancelled())goto cleanup;
    report(UPDATE_INSTALLING,"Installing update. Keep the console on.",0,0);
    rc=AM_StartCiaInstall(MEDIATYPE_SD,&install_handle);install_open=R_SUCCEEDED(rc);if(!install_open)goto cleanup;
    rc=mbedtls_sha256_starts_ret(&sha,0);u64 offset=0;
    while(R_SUCCEEDED(rc)&&offset<release.size&&!cancelled()){
        u32 count=0,written=0,wanted=release.size-offset;if(wanted>IO_BYTES)wanted=IO_BYTES;
        rc=FSFILE_Read(file_handle,&count,offset,buffer,wanted);if(R_FAILED(rc)||count!=wanted){rc=-1;break;}
        rc=mbedtls_sha256_update_ret(&sha,buffer,count);if(R_FAILED(rc))break;
        rc=FSFILE_Write(install_handle,&written,offset,buffer,count,0);if(R_FAILED(rc)||written!=count){rc=-1;break;}
        offset+=count;report(UPDATE_INSTALLING,"Installing update. Keep the console on.",0,offset*100/release.size);
    }
    if(R_FAILED(rc)||offset!=release.size||cancelled())goto cleanup;
    rc=mbedtls_sha256_finish_ret(&sha,digest);if(R_FAILED(rc)||memcmp(digest,release.sha256,32)){rc=-1;failure="Update file changed during installation.";goto cleanup;}
    install_open=false; /* Finish transfers ownership of the install handle. */
    rc=AM_FinishCiaInstall(install_handle);if(R_FAILED(rc))goto cleanup;
    report(UPDATE_INSTALLED,"Updated! Press START, then reopen Forge.",0,100);
cleanup:
    if(install_open)AM_CancelCIAInstall(install_handle);
    if(file_open)FSFILE_Close(file_handle);
    if(file)fclose(file);
    if(mounted)remove(LOCAL_CIA);
    if(am_ready)amExit();
    if(network_ready)network_end();
    if(mounted)archiveUnmountAll();
    if(fs_ready)fsExit();
    mbedtls_sha256_free(&sha);free(buffer);
    ForgeUpdateStatus snapshot;forge_update_snapshot(&snapshot);
    if(snapshot.state!=UPDATE_INSTALLED)report(cancelled()?UPDATE_CANCELLED:UPDATE_ERROR,cancelled()?"Update cancelled. Press X to retry.":failure,rc,0);
}
static void task(void *argument) {
    if((uintptr_t)argument==1)install_release();else check_release();
    LightLock_Lock(&lock);busy=false;LightLock_Unlock(&lock);
}
static void start(bool install) {
    LightLock_Lock(&lock);bool active=busy;ForgeUpdateState current=status.state;LightLock_Unlock(&lock);
    if(active||(install&&current!=UPDATE_AVAILABLE)||current==UPDATE_INSTALLED)return;
    if(worker){threadJoin(worker,UINT64_MAX);threadFree(worker);worker=NULL;}
    LightLock_Lock(&lock);cancel_requested=false;busy=true;LightLock_Unlock(&lock);
    report(install?UPDATE_DOWNLOADING:UPDATE_CHECKING,install?"Preparing update...":"Checking for updates...",0,0);
    worker=threadCreate(task,(void *)(uintptr_t)(install?1:0),128*1024,0x30,-2,false);
    if(!worker){LightLock_Lock(&lock);busy=false;LightLock_Unlock(&lock);report(UPDATE_ERROR,"Could not start updater.",-1,0);}
}
void forge_update_init(void) { LightLock_Init(&lock);memset(&status,0,sizeof(status));status.state=UPDATE_IDLE; }
void forge_update_check(void) { start(false); }
void forge_update_install(void) { start(true); }
void forge_update_shutdown(void) { forge_update_cancel();if(worker){threadJoin(worker,UINT64_MAX);threadFree(worker);worker=NULL;} }
