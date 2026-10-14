#include <3ds.h>
#include <string.h>
#include "splash.h"
#include "update.h"
#include "update-trust.h"
#include <stdio.h>

/* The splash has no filesystem resources. Avoid libctru's default SD mount. */
void __appInit(void) {
    if (R_FAILED(srvInit())) svcBreak(USERBREAK_PANIC);
    if (R_FAILED(aptInit())) svcBreak(USERBREAK_PANIC);
    if (R_FAILED(hidInit())) svcBreak(USERBREAK_PANIC);
}
void __appExit(void) {
    hidExit();
    aptExit();
    srvExit();
}

int main(void) {
    gfxInitDefault();
    gfxSet3D(false);
    forge_update_init();
    unsigned frame = 0;
    bool updater_started = false;
    ForgeUpdateStatus previous = {0};
    while (aptMainLoop()) {
        hidScanInput();
        u32 keys = hidKeysDown();
        if (keys & KEY_START) break;
        if (updater_started) {
            if (keys & KEY_X) forge_update_check();
            if (keys & KEY_A) forge_update_install();
            ForgeUpdateStatus current; forge_update_snapshot(&current);
            if ((keys & KEY_B) && current.state != UPDATE_INSTALLING) forge_update_cancel();
            if (memcmp(&current, &previous, sizeof(current))) {
                consoleClear();printf("FORGE %s\n\n", FORGE_VERSION);
                if (current.state == UPDATE_AVAILABLE) printf("Version %u.%u.%u available\n\n", current.version >> 10, (current.version >> 4) & 63, current.version & 15);
                printf("%s\n", current.message);
                if (current.state == UPDATE_DOWNLOADING || current.state == UPDATE_INSTALLING) printf("\n%u%%\n", current.progress);
                if (current.error) printf("\nError: %08lX\n", (unsigned long)current.error);
                printf("\nSTART: exit\n");previous=current;
            }
        }
        forge_draw_top(gfxGetFramebuffer(GFX_TOP, GFX_LEFT, NULL, NULL), frame);
        if (!updater_started) memset(gfxGetFramebuffer(GFX_BOTTOM, GFX_LEFT, NULL, NULL), 16, 320 * 240 * 3);
        gfxFlushBuffers();
        gfxSwapBuffers();
        gspWaitForVBlank();
        if (frame < 180) ++frame;
        if (frame == 90 && !updater_started) { consoleInit(GFX_BOTTOM, NULL); updater_started=true; forge_update_check(); }
    }
    forge_update_shutdown();
    gfxExit();
    return 0;
}
