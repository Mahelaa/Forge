#pragma once
#include <3ds.h>
typedef enum { UPDATE_IDLE, UPDATE_CHECKING, UPDATE_CURRENT, UPDATE_AVAILABLE, UPDATE_DOWNLOADING, UPDATE_INSTALLING, UPDATE_INSTALLED, UPDATE_ERROR, UPDATE_CANCELLED } ForgeUpdateState;
typedef struct { ForgeUpdateState state; unsigned progress; u16 version; Result error; char message[96]; } ForgeUpdateStatus;
void forge_update_init(void);
void forge_update_check(void);
void forge_update_install(void);
void forge_update_cancel(void);
void forge_update_snapshot(ForgeUpdateStatus *status);
void forge_update_shutdown(void);
