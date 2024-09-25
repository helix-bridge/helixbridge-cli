export function absBigInt(n) {
  return (n < 0n) ? -n : n
}

export function floatToBigInt(value, decimal) {
  const floatStr = value.toString();
  if (!floatStr.includes('.')) {
    return BigInt(value) * (10n ** BigInt(decimal));
  }

  const decimalPlaces = floatStr.split('.')[1].length;
  const fixedValue = BigInt(value * (10 ** decimalPlaces));
  return fixedValue * (10n ** (BigInt(decimal) - BigInt(decimalPlaces)))
}

export function pickIndexEndpoint(chain) {
  return chain._network === 'mainnets'
    ? 'https://apollo.helixbridge.app/graphql'
    : 'https://apollo-test.helixbridge.app/graphql';
}

// export function pickDecimal(options = {definition, decimal, chain, symbol}) {
//   const {definition, decimal, chain, symbol} = options;
//   if (decimal && decimal.length > 2) {
//     return BigInt(decimal);
//   }
//   const definitionDecimal = definition.decimal;
//   const symbolDecimal = definitionDecimal[symbol];
//   const chainDecimal = symbolDecimal[chain];
//   const symbolDefaultDecimal = symbolDecimal['generic'];
//   return BigInt(chainDecimal ? chainDecimal : symbolDefaultDecimal);
// }

export function isDisableApprove(options = {definition, symbol, chainId}) {
  const {definition, symbol, chainId} = options;
  const featureApprove = definition.features.approve;
  const approveDisable = featureApprove.disable;
  const ix = approveDisable.findIndex(item => item.symbol === symbol && item.chain.toString() === chainId.toString())
  return ix !== -1;
}

// export function isNativeToken(options = {definition, symbol, chainId}) {
//   const {definition, symbol, chainId} = options;
//   const nativetoken = definition.nativetoken[chainId];
//   if (!nativetoken || !symbol) return false;
//   return nativetoken.toLowerCase() === symbol.toLowerCase();
// }

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
      fromChain: lifecycle.sourceChain.code,
      toChain: lifecycle.targetChain.code,
      relayer: lifecycle.relayerAddress,
      version,
    }
  };
  const indexEndpoint = await pickIndexEndpoint(lifecycle.targetChain);
  const responseLnBridgeInfos = await fetch(indexEndpoint, {
    method: 'post',
    body: JSON.stringify(gqlBody),
    headers: {'Content-Type': 'application/json'}
  });
  const lnBridgeInfos = await responseLnBridgeInfos.json();
  const [bridgeInfoRecord] = lnBridgeInfos.data.queryLnBridgeRelayInfos.records.filter(item => {
    if (item.bridge !== bridge) return false;
    if (item.sendToken.toLowerCase() !== sourceTokenAddress.toLowerCase()) return false;
    return true;
  });
  return bridgeInfoRecord;
}
