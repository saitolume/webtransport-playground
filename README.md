# WebTransport Playground

Live Streaming Software implemented by WebTransport

## Requirements

- Node.js 16.13.0
- Python 3.10.0

## Running

```bash
$ yarn dev
$ cd server && poetry run python src/main.py certificate.pem certificate.ke
$ /Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary \
    --origin-to-force-quic-on=localhost:4433 \
    --ignore-certificate-errors-spki-list=MfOaAJF86qocgOLP1f/AcKjmWas33nqJ0XxnmQ1/0Gg=
```
