# Project Instructions for Claude

## Git Commit Guidelines

When committing changes:

1. **Always commit your changes** - Don't leave work uncommitted
2. **Disable GPG signing** - Use `--no-gpg-sign` flag
3. **Set the author** - Use `--author="ClaudeCLI <scirelli+claudecli@gmail.com>"`

Example commit command:
```bash
git commit --no-gpg-sign --author="ClaudeCLI <scirelli+claudecli@gmail.com>" -m "$(cat <<'EOF'
Commit message here

Co-Authored-By: Claude Code
EOF
)"
```
