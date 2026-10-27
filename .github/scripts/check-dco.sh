#!/bin/sh
# Every commit in <base>..<head> (merges aside) carries a Developer Certificate of Origin sign-off by its author:
#   Signed-off-by: Jane Doe <jane@example.org>
# (git commit -s adds it). See DCO.md and CONTRIBUTING.md.
#   .github/scripts/check-dco.sh <base> <head>
set -eu
base=${1:?usage: check-dco.sh <base> <head>}
head=${2:?usage: check-dco.sh <base> <head>}
fail=0
count=0
for c in $(git rev-list --no-merges "$base..$head"); do
  count=$((count + 1))
  author=$(git log -1 --format='%an <%ae>' "$c")
  if ! git log -1 --format=%B "$c" | grep -qiF "Signed-off-by: $author"; then
    echo "::error::$(git log -1 --format='%h %s' "$c"): no 'Signed-off-by: $author'. Sign off with git commit -s (git rebase --signoff $base to fix a branch); see CONTRIBUTING.md."
    fail=1
  fi
done
[ "$fail" -eq 0 ] && echo "DCO: $count commit(s) signed off"
exit $fail
