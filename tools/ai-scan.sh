#!/usr/bin/env bash
# Scans prose for AI-writing tells. Rules: docs/executive-pulse/AI-Writing-Signals-Checklist.md
# Usage: tools/ai-scan.sh file1 file2 ...
export LC_ALL=en_US.UTF-8
[ $# -eq 0 ] && { echo "usage: $0 <files...>"; exit 1; }
fail=0
chk(){  o=$(grep -nE  "$2" "$@" 2>/dev/null); }
run(){  local label="$1" pat="$2" ci="$3" out
        if [ "$ci" = "i" ]; then out=$(grep -rniE "$pat" "${FILES[@]}" 2>/dev/null)
        else out=$(grep -rnE "$pat" "${FILES[@]}" 2>/dev/null); fi
        if [ -n "$out" ]; then echo "FAIL  $label"; echo "$out" | sed 's/^/        /'; fail=1
        else echo "PASS  $label"; fi; }
FILES=("$@")

run "em dash"              "—" ""
run "en dash"              "–" ""
run "middot decoration"    "·" ""
run "emoji"                "👋|🚀|✨|🎯|💡|🔥|📌|🌟|😊" ""
run "curly quotes (real)" "[‘“”’]" ""
run "AI vocab"             "\b(resonates?|vibrant|delve|underscore|showcasing|highlighting|emphasizing|garner|meticulous|intricate|interplay|fostering|tapestry|testament|bolster|enduring|pivotal|crucial|align with|valuable insights|leverage)\b" i
run "puffery"              "\b(boasts?|nestled|in the heart of|groundbreaking|renowned|breathtaking|diverse array|bustling|profound|myriad|plethora|realm|robust|seamless|holistic|elevate|unparalleled|cutting.edge)\b" i
run "copula avoidance"     "\b(serves as|stands as|functions as|operates as|is a testament|plays a (key|vital|crucial|pivotal) role)\b" i
run "negative parallelism" "(not just|not only|isn.t just|rather than)" i
run "weasel attribution"   "\b(experts (say|argue)|some (argue|say)|observers note|industry reports|studies show)\b" i
run "filler connectives"   "\b(Additionally|Moreover|Furthermore|In conclusion|Overall|Ultimately|Notably)\b" i
run "scaffolding"          "(what follows is|let.s dive|without further ado|it.s worth noting|in this (post|article) we)" i
run "vague thinking-verbs" "(keep coming back to|at the end of the day|when it comes to|the reality is)" i
run "challenges wrap-up"   "despite (its|these|the) (challenges|setbacks)" i
run "significance inflation" "\b(marking a|turning point|evolving landscape|indelible|deeply rooted|reflects a broader|represents a shift|game.chang)" i
run "reader address"       "(we will explore|let us consider|in this article|dive into)" i
run "tacked-on purpose"    ", so (you|they|we) (can|could|know|never|don.t|aren.t|do not)" i
run "clipped adverbial"    "^[A-Z][a-z]+ (months?|years?|weeks?|days?) (in|later|on)," ""

echo
[ $fail -eq 0 ] && echo "==> ALL CHECKS PASS" || echo "==> FAILURES ABOVE"
