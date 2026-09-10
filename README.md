# fenix

**Burn down, rise with context.**

Write what's in motion before you `/clear`; the next session in that directory
resumes the thread instead of starting cold.

Extracted from [maxx](https://github.com/The-Good-Project-Team/Maxx) on 2026-09-10.
maxx is a spend counter; fenix is context continuity. Two products, two repos.

## Use

```
/fenix          # write the handoff, then /clear
```

The SessionStart hook re-injects it in the next session automatically.

## Install

```bash
node fenix/fenix.mjs --install
```

## Test

```bash
npm test
```

## License

MIT.
