relayer-cli
===


```
helixbridge

  register            register a relayer
                      helixbridge register
                        --group=mainnet
                        --datadir=/path/to/config

  encrypt             encrypt a private key
                      helixbridge encrypt

  generate-configure  generate relayer configure
                      helixbridge generate-configure
                        --group=mainnet
                        --datadir=/path/to/config
                        [--encrypted-private-key=your_encrypted_private_key]
```

## with Docker

```
alias helixbridge='docker run -it --rm --name helixbridge -v $PWD:/relayer ghcr.io/helix-bridge/helixbridge-cli:v0.0.1'


helixbridge register --group=mainnet --datadir=/relayer
```
