#!/usr/bin/env bash
set -euo pipefail
export PATH="/opt/devkitpro/tools/bin:/opt/devkitpro/devkitARM/bin:$PATH"
cd /work
unzip -oq /tools/makerom.zip -d /tools/makerom
unzip -oq /tools/ctrtool.zip -d /tools/ctrtool
unzip -oq /tools/bannertool.zip linux-x86_64/bannertool -d /tools
chmod +x /tools/makerom/makerom /tools/ctrtool/ctrtool /tools/linux-x86_64/bannertool
IFS=. read -r major minor micro <<< "${FORGE_VERSION:?FORGE_VERSION is required}"
make -j2
/tools/linux-x86_64/bannertool makebanner -i assets/banner.png -a assets/silence.wav -o forge-3ds.bnr
/tools/makerom/makerom -f cia -o forge-3ds.cia -rsf forge.rsf -target t -elf forge-3ds.elf -icon forge-3ds.smdh -banner forge-3ds.bnr -exefslogo -major "$major" -minor "$minor" -micro "$micro"
/tools/ctrtool/ctrtool --verify forge-3ds.cia > /tmp/forge-verify.log 2>&1
# Homebrew test-key signatures are not retail Nintendo signatures. Verify payload integrity.
if grep -Ei 'hash.*\(FAIL\)|\(FAIL\).*hash' /tmp/forge-verify.log; then exit 1; fi
if grep 'ERROR' /tmp/forge-verify.log | grep -Ev 'Signature for (Ticket|TitleMetaData|AccessDescriptor) was invalid'; then exit 1; fi
grep -q 'Hash: (GOOD)' /tmp/forge-verify.log
grep -q 'Exheader hash: (GOOD)' /tmp/forge-verify.log
grep -q 'ExeFS hash: (GOOD)' /tmp/forge-verify.log
test "$(grep -c 'Section hash: (GOOD)' /tmp/forge-verify.log)" -eq 4
grep -q 'Name:.*Forge' /tmp/forge-verify.log
grep -q 'Program id:.*000400000f07a100 (GOOD)' /tmp/forge-verify.log
printf 'CIA payload, exheader, executable, icon and banner hashes verified.\n'
