# https://www.spinics.net/lists/dash/msg01750.html

trap '(false) && echo BUG' INT
kill -s INT $$
