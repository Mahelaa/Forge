#pragma once
#include <stdint.h>
int forge_sd_free_bytes(uint32_t cluster_size,uint32_t total_clusters,uint32_t free_clusters,uint64_t *bytes);
