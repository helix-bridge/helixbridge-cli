export function absBigInt(n) {
  return (n < 0n) ? -n : n
}

export function floatToBigInt(value, decimal) {
  const _v = Number(value);
  const isFloat = _v % 1 !== 0;
  let fixedValue = isFloat
    ? BigInt(Number(value.toFixed(2)) * (10 ** 2))
    : _v;
  return isFloat
    ? fixedValue * (10n ** (decimal - 2n))
    : fixedValue * (10n ** decimal);
}

export function pickIndexEndpoint(options, chainName) {
  const {definition} = options;
  const indexerDefinition = definition.indexer;
  const keys = Object.keys(indexerDefinition);
  for (const key of keys) {
    const itemOfIndexer = indexerDefinition[key];
    if (itemOfIndexer.chains.indexOf(chainName) > -1) {
      return itemOfIndexer.endpoint;
    }
  }
  console.log(`not found index endpoint for chain: ${chainName}`);
  process.exit(1);
}

export async function queryBridgeInfoRecord(options = {lifecycle, version, sourceTokenAddress, bridge}) {
  const {lifecycle, version, sourceTokenAddress, bridge} = options;
  const gqlBody = {
    operationName: 'queryLnBridgeRelayInfos',
    query: `
  query queryLnBridgeRelayInfos(
    $fromChain: String,
    $toChain: String,
    $relayer: String,
    $row: Int,
    $page: Int,
    $version: String
  ) {
    queryLnBridgeRelayInfos(
      fromChain: $fromChain
      toChain: $toChain
      relayer: $relayer
      row: $row
      page: $page
      version: $version
    ) {
      records {
        bridge
        relayer
        sendToken
        margin
      }
    }
  }
  `,
    variables: {
      page: 0,
      row: 100,
      fromChain: lifecycle.sourceChainName,
      toChain: lifecycle.targetChainName,
      relayer: lifecycle.relayerAddress,
      version,
    }
  };
  const indexEndpoint = await pickIndexEndpoint(options, lifecycle.targetChainName);
  const responseLnBridgeInfos = await fetch(indexEndpoint, {
    method: 'post',
    body: JSON.stringify(gqlBody),
    headers: {'Content-Type': 'application/json'}
  });
  const lnBridgeInfos = await responseLnBridgeInfos.json();
  const [bridgeInfoRecord] = lnBridgeInfos.data.queryLnBridgeRelayInfos.records.filter(item => {
    if (item.bridge !== bridge) return false;
    if (item.sendToken !== sourceTokenAddress) return false;
    return true;
  });
  return bridgeInfoRecord;
}
