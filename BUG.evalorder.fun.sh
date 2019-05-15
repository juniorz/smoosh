show() { echo "got ${EFF-unset}"; }
unset x
EFF=${x=assign} show 2>${x=redir}
echo ${EFF-unset after function call}
[ -f assign ] && echo assign exists && rm assign
[ -f redir ] && echo redir exists && rm redir

# bash: assign
# yash, dash: redir
# smoosh: doesn't show up in the function at all!
