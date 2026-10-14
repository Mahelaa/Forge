#include "splash.h"
#include "logo.h"
#include <string.h>

/* Rows of the small bitmap font, restricted to the requested sentence. */
static const struct { char letter; uint8_t rows[7]; } glyphs[] = {
    {'H',{17,17,17,31,17,17,17}}, {'e',{0,0,14,17,31,16,14}},
    {'l',{12,4,4,4,4,4,14}}, {'o',{0,0,14,17,17,17,14}},
    {'i',{4,0,12,4,4,4,14}}, {'t',{4,4,31,4,4,5,2}},
    {'s',{0,0,15,16,14,1,30}}, {'m',{0,0,26,21,21,17,17}},
    {'W',{17,17,17,21,21,21,10}}, {'a',{0,0,14,1,15,17,15}},
    {'r',{0,0,22,25,16,16,16}}, {'.',{0,0,0,0,0,12,12}},
    {' ',{0,0,0,0,0,0,0}}
};
static const char greeting[] = "Hello its me Wario.";

static unsigned opacity(unsigned frame, unsigned delay, unsigned duration) {
    if (frame <= delay) return 0;
    if (frame >= delay + duration) return 255;
    return (frame - delay) * 255 / duration;
}
static void pixel(uint8_t *fb, int x, int y, uint8_t shade) {
    if (x < 0 || x >= 400 || y < 0 || y >= 240) return;
    /* 3DS RGB8 framebuffers are rotated, with BGR channel ordering. */
    const unsigned offset = ((unsigned)x * 240 + 239 - (unsigned)y) * 3;
    fb[offset] = shade; fb[offset + 1] = shade; fb[offset + 2] = shade;
}
void forge_draw_top(uint8_t *fb, unsigned frame) {
    memset(fb, 16, 400 * 240 * 3);
    const unsigned logo_alpha = opacity(frame, 0, 90);
    for (int y = 0; y < FORGE_LOGO_HEIGHT; ++y)
        for (int x = 0; x < FORGE_LOGO_WIDTH; ++x) {
            const unsigned shade = forge_logo[y * FORGE_LOGO_WIDTH + x];
            pixel(fb, 40 + x, 65 + y, 16 + shade * logo_alpha * 239 / (255 * 255));
        }
    const unsigned text_alpha = opacity(frame, 45, 45);
    const uint8_t color = 16 + 239 * text_alpha / 255;
    const int scale = 2;
    const int text_width = (sizeof(greeting) - 1) * 6 * scale - scale;
    int cursor = (400 - text_width) / 2;
    for (unsigned i = 0; i < sizeof(greeting) - 1; ++i, cursor += 6 * scale) {
        const uint8_t *rows = NULL;
        for (unsigned g = 0; g < sizeof(glyphs) / sizeof(glyphs[0]); ++g)
            if (glyphs[g].letter == greeting[i]) { rows = glyphs[g].rows; break; }
        if (!rows) continue;
        for (int y = 0; y < 7; ++y) for (int x = 0; x < 5; ++x)
            if (rows[y] & (1 << (4 - x)))
                for (int dy = 0; dy < scale; ++dy) for (int dx = 0; dx < scale; ++dx)
                    pixel(fb, cursor + x * scale + dx, 171 + y * scale + dy, color);
    }
}
