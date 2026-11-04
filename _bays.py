import io
p = "index.html"
s = io.open(p, encoding="utf-8", newline="").read()
old = "const numBays = Math.max(2, Math.round(L / 3.0));"
new = "const numBays = Math.max(2, Math.round(L / 4.0));"
n = s.count(old)
if n != 2:
    raise SystemExit("ocurrencias: %d" % n)
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("bays actualizados:", n)
