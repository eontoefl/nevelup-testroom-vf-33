#!/bin/bash
# ============================================
# Reading Result Migration Validator
# 마이그레이션 전/후 검증 스크립트
# ============================================

ROOT="$(cd "$(dirname "$0")" && pwd)"
ERRORS=0
WARNINGS=0
PASS=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { ((PASS++)); echo -e "  ${GREEN}PASS${NC} $1"; }
fail() { ((ERRORS++)); echo -e "  ${RED}FAIL${NC} $1"; }
warn() { ((WARNINGS++)); echo -e "  ${YELLOW}WARN${NC} $1"; }
info() { echo -e "  ${CYAN}INFO${NC} $1"; }

echo ""
echo "========================================"
echo " Reading Result Migration Validator"
echo "========================================"
echo ""

# ─── Phase Detection ───
PHASE="pre"
if [ -f "$ROOT/css/reading-result.css" ]; then
    PHASE="post"
fi
echo -e "Detected phase: ${CYAN}${PHASE}-migration${NC}"
echo ""

# ============================================
# CHECK 1: Old prefix remnants in JS files
# ============================================
echo "[CHECK 1] Old prefix remnants in JS files"

JS_FILES=("$ROOT/js/reading/daily1-result.js" "$ROOT/js/reading/daily2-result.js" "$ROOT/js/reading/academic-result.js")

for jsfile in "${JS_FILES[@]}"; do
    fname=$(basename "$jsfile")
    if [ ! -f "$jsfile" ]; then
        warn "$fname not found (may have been merged)"
        continue
    fi

    if [ "$PHASE" = "post" ]; then
        # Post-migration: old prefixes should NOT exist (except in function names, IDs, comments)
        # Check for class= or className= with old prefix
        old_class_count=$(grep -oP 'class(?:Name)?[=\s"]+[^"]*(?:daily1-|daily2-|academic-)' "$jsfile" 2>/dev/null | wc -l)
        if [ "$old_class_count" -gt 0 ]; then
            fail "$fname still has $old_class_count old prefix class references"
            grep -n 'class\(Name\)\?[="'"'"' ]*[^"]*\(daily1-\|daily2-\|academic-\)' "$jsfile" | head -5
        else
            pass "$fname: no old prefix class references"
        fi

        # Check rd- prefix exists
        rd_count=$(grep -oP 'rd-' "$jsfile" 2>/dev/null | wc -l)
        if [ "$rd_count" -gt 0 ]; then
            pass "$fname: has $rd_count rd- references"
        else
            fail "$fname: no rd- prefix found after migration"
        fi
    else
        # Pre-migration: catalog all prefixed classes
        d1_count=$(grep -oP 'daily1-[a-z][a-z0-9-]*' "$jsfile" 2>/dev/null | sort -u | wc -l)
        d2_count=$(grep -oP 'daily2-[a-z][a-z0-9-]*' "$jsfile" 2>/dev/null | sort -u | wc -l)
        ac_count=$(grep -oP 'academic-[a-z][a-z0-9-]*' "$jsfile" 2>/dev/null | sort -u | wc -l)
        info "$fname: daily1-($d1_count unique), daily2-($d2_count unique), academic-($ac_count unique)"
    fi
done
echo ""

# ============================================
# CHECK 2: CSS file status
# ============================================
echo "[CHECK 2] CSS file status"

OLD_CSS_FILES=(
    "$ROOT/css/reading-daily1-result.css"
    "$ROOT/css/reading-daily2-result.css"
    "$ROOT/css/reading-academic-result.css"
)
NEW_CSS="$ROOT/css/reading-result.css"

if [ "$PHASE" = "post" ]; then
    # New file should exist
    if [ -f "$NEW_CSS" ]; then
        pass "css/reading-result.css exists"
        line_count=$(wc -l < "$NEW_CSS")
        info "  line count: $line_count"
    else
        fail "css/reading-result.css not found"
    fi

    # Old files should not exist
    for old_css in "${OLD_CSS_FILES[@]}"; do
        fname=$(basename "$old_css")
        if [ -f "$old_css" ]; then
            fail "$fname still exists (should be deleted)"
        else
            pass "$fname removed"
        fi
    done

    # No old prefix in new CSS
    if [ -f "$NEW_CSS" ]; then
        old_in_css=$(grep -cP '\.daily1-|\.daily2-|\.academic-' "$NEW_CSS" 2>/dev/null || true)
        if [ "$old_in_css" -gt 0 ]; then
            fail "reading-result.css has $old_in_css old prefix selectors"
        else
            pass "reading-result.css: no old prefixes"
        fi

        rd_in_css=$(grep -cP '\.rd-' "$NEW_CSS" 2>/dev/null || true)
        if [ "$rd_in_css" -gt 0 ]; then
            pass "reading-result.css: has $rd_in_css rd- selectors"
        else
            fail "reading-result.css: no rd- selectors found"
        fi
    fi
else
    # Pre-migration: old files should exist
    for old_css in "${OLD_CSS_FILES[@]}"; do
        fname=$(basename "$old_css")
        if [ -f "$old_css" ]; then
            line_count=$(wc -l < "$old_css")
            pass "$fname exists ($line_count lines)"
        else
            fail "$fname not found"
        fi
    done
fi
echo ""

# ============================================
# CHECK 3: index.html CSS link tags
# ============================================
echo "[CHECK 3] index.html CSS link references"

if [ "$PHASE" = "post" ]; then
    old_links=$(grep -c 'reading-daily1-result\|reading-daily2-result\|reading-academic-result' "$ROOT/index.html" 2>/dev/null || true)
    if [ "$old_links" -gt 0 ]; then
        fail "index.html still has $old_links old CSS link(s)"
    else
        pass "index.html: old CSS links removed"
    fi

    new_link=$(grep -c 'reading-result\.css' "$ROOT/index.html" 2>/dev/null || true)
    if [ "$new_link" -ge 1 ]; then
        pass "index.html: reading-result.css link present"
    else
        fail "index.html: reading-result.css link missing"
    fi
else
    old_links=$(grep -c 'reading-daily1-result\|reading-daily2-result\|reading-academic-result' "$ROOT/index.html" 2>/dev/null || true)
    info "index.html: $old_links old CSS links found (expected: 3)"
fi
echo ""

# ============================================
# CHECK 4: Window function exports
# ============================================
echo "[CHECK 4] Window function exports"

REQUIRED_EXPORTS=(
    "window.showDaily1Results"
    "window.showDaily2Results"
    "window.showAcademicResults"
    "window.toggleDaily1Options"
    "window.toggleDaily2Options"
    "window.toggleAcademicOptions"
    "window.bindDaily1ToggleEvents"
    "window.bindDaily2ToggleEvents"
    "window.bindAcademicToggleEvents"
    "window.renderDaily1SetResult"
    "window.renderDaily2SetResult"
    "window.renderAcademicSetResult"
    "window.renderDaily1Answers"
    "window.renderDaily2Answers"
    "window.renderAcademicAnswers"
    "window.renderDaily1OptionsExplanation"
    "window.renderDaily2OptionsExplanation"
    "window.renderAcademicOptionsExplanation"
)

for export_name in "${REQUIRED_EXPORTS[@]}"; do
    found=$(grep -rl "$export_name" "$ROOT/js/reading/" 2>/dev/null | wc -l)
    if [ "$found" -gt 0 ]; then
        pass "$export_name"
    else
        fail "$export_name not found in any JS file"
    fi
done
echo ""

# ============================================
# CHECK 5: HTML element ID references
# ============================================
echo "[CHECK 5] HTML element ID references"

REQUIRED_IDS=(
    "daily1ExplainScreen"
    "daily2ExplainScreen"
    "academicExplainScreen"
    "daily1ResultDayTitle"
    "daily2ResultDayTitle"
    "academicResultDayTitle"
    "daily1ResultScoreValue"
    "daily2ResultScoreValue"
    "academicResultScoreValue"
    "daily1ResultCorrectCount"
    "daily2ResultCorrectCount"
    "academicResultCorrectCount"
    "daily1ResultIncorrectCount"
    "daily2ResultIncorrectCount"
    "academicResultIncorrectCount"
    "daily1ResultTotalCount"
    "daily2ResultTotalCount"
    "academicResultTotalCount"
    "daily1ResultDetails"
    "daily2ResultDetails"
    "academicResultDetails"
)

for id in "${REQUIRED_IDS[@]}"; do
    # Check HTML
    html_found=$(grep -c "id=\"$id\"" "$ROOT/index.html" 2>/dev/null || true)
    # Check JS references
    js_found=$(grep -rl "$id" "$ROOT/js/reading/" "$ROOT/js/explain-viewer.js" 2>/dev/null | wc -l)

    if [ "$html_found" -ge 1 ] && [ "$js_found" -ge 1 ]; then
        pass "$id (HTML: $html_found, JS: $js_found)"
    elif [ "$html_found" -ge 1 ]; then
        warn "$id exists in HTML but no JS reference"
    else
        fail "$id missing from HTML"
    fi
done
echo ""

# ============================================
# CHECK 6: JS-CSS class cross-reference (post-migration only)
# ============================================
if [ "$PHASE" = "post" ] && [ -f "$NEW_CSS" ]; then
    echo "[CHECK 6] JS→CSS class cross-reference"

    # Extract all rd- class names from JS
    js_rd_classes=$(grep -ohrP 'rd-[a-z][a-z0-9-]*' "${JS_FILES[@]}" 2>/dev/null | sort -u)

    # Extract all rd- selectors from CSS
    css_rd_selectors=$(grep -oP '\.rd-[a-z][a-z0-9-]*' "$NEW_CSS" 2>/dev/null | sed 's/^\.//' | sort -u)

    for cls in $js_rd_classes; do
        # Skip dynamic toggle/tab IDs (rd-options-*, rd-toggle-*, rd-original-*, rd-translation-*)
        if echo "$cls" | grep -qP '^rd-(options|toggle|original|translation)-'; then
            continue
        fi
        if echo "$css_rd_selectors" | grep -qx "$cls"; then
            pass ".$cls defined in CSS"
        else
            fail ".$cls used in JS but NOT defined in CSS"
        fi
    done
    echo ""
fi

# ============================================
# CHECK 7: splitToMatchTranslations functions
# ============================================
echo "[CHECK 7] splitToMatchTranslations functions"

SPLIT_FNS=("splitToMatchTranslations\b" "splitToMatchTranslations_d2" "splitToMatchTranslations_ac")

for fn in "${SPLIT_FNS[@]}"; do
    found=$(grep -Prl "function ${fn}" "$ROOT/js/reading/" 2>/dev/null | wc -l)
    if [ "$found" -ge 1 ]; then
        pass "function $fn exists"
    else
        fail "function $fn not found"
    fi
done
echo ""

# ============================================
# CHECK 8: Scoped CSS (no unscoped common classes leaking)
# ============================================
if [ "$PHASE" = "post" ] && [ -f "$NEW_CSS" ]; then
    echo "[CHECK 8] CSS scoping check"

    # Common classes that MUST be scoped under a screen ID
    MUST_SCOPE=(
        ".result-header"
        ".result-summary"
        ".result-score-card"
        ".result-stats"
        ".stat-item"
        ".score-label"
        ".score-value"
        ".result-set-section"
        ".result-section-title"
    )

    for cls in "${MUST_SCOPE[@]}"; do
        # Check if class appears WITHOUT a screen ID prefix
        unscoped=$(grep -P "^${cls//./\\.}\s*\{" "$NEW_CSS" 2>/dev/null | wc -l)
        if [ "$unscoped" -gt 0 ]; then
            warn "$cls may be unscoped (could affect other screens)"
        else
            pass "$cls properly scoped or not present at top level"
        fi
    done
    echo ""
fi

# ============================================
# Summary
# ============================================
echo "========================================"
echo -e " Results: ${GREEN}$PASS PASS${NC} / ${RED}$ERRORS FAIL${NC} / ${YELLOW}$WARNINGS WARN${NC}"
echo "========================================"
echo ""

if [ "$ERRORS" -gt 0 ]; then
    echo -e "${RED}Migration validation FAILED with $ERRORS error(s).${NC}"
    exit 1
elif [ "$WARNINGS" -gt 0 ]; then
    echo -e "${YELLOW}Migration validation PASSED with $WARNINGS warning(s).${NC}"
    exit 0
else
    echo -e "${GREEN}Migration validation PASSED (all checks OK).${NC}"
    exit 0
fi
