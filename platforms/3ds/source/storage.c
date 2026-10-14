#include "storage.h"
int forge_sd_free_bytes(uint32_t cluster_size,uint32_t total_clusters,uint32_t free_clusters,uint64_t *bytes) {
    if(!bytes||!cluster_size||!total_clusters||free_clusters>total_clusters)return -1;
    *bytes=(uint64_t)cluster_size*free_clusters;
    return 0;
}
