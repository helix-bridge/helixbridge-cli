import * as arg from "../ecosys/arg.js";


export async function check() {
  const datadir = arg.datadir();
  if (!datadir) {
    console.log(chalk.red('missing datadir, please add --datadir=/path/to/data or -d=/path/to/data'));
    process.exit(1);
  }
  if (!await fs.pathExists(datadir)) {
    console.log(chalk.red(`the datadir [${datadir}] not exists`));
    process.exit(1);
  }
}

export async function generate(options) {
  const groups = arg.options('group');
  if (!groups || !groups.length) {
    console.log(chalk.red('missing group, please add --group'));
    process.exit(1);
  }

  for (const group of groups) {
    await generateWithGroup(options, group);
  }
}

async function generateWithGroup(options, group) {
  const bridgeConfigRaw = await fs.readFile(arg.datapath(`/src/bridges.${group}.yml`), 'utf8');
  const bridgeConfig = YAML.parse(bridgeConfigRaw);
  const configure = bridgeConfig.configure;
  await refactorConfig({configure, group});

  const CONFIGURE_PATH = arg.datapath('/configure');
  const storeFile = `${CONFIGURE_PATH}/configure.${group}.json`;
  await $`mkdir -p ${CONFIGURE_PATH}`.quiet();

  const fillOptions = {
    ...options,
    configure,
  };

  await _fillEncryptedPrivateKey(fillOptions);
  await _fillRpcnodes(fillOptions);

  const outputJson = JSON.stringify(configure, null, 2);
  await fs.writeFile(storeFile, outputJson);
  console.log(storeFile);
  console.log('---------');
  console.log(outputJson);
  console.log('');
}

async function refactorConfig(options) {
  const {configure, group} = options;
  const nbdgs = [];
  for (const bridge of configure.bridges) {
    const include = bridge.include;
    if (!include) {
      nbdgs.push(bridge);
      continue;
    }

    const keys = Object.keys(bridge);
    if (keys.length > 1) {
      throw new Error(`include mode please do not add other fields: [${keys.join(', ')}]`)
    }

    let includeFileContent;
    if (fs.existsSync(include)) {
      includeFileContent = await fs.readFile(include, 'utf8');
    }
    // check path from datapath
    const pathOfIncludeFromDataPath = arg.datapath(`/src/${include}`);
    if (fs.existsSync(pathOfIncludeFromDataPath)) {
      includeFileContent = await fs.readFile(pathOfIncludeFromDataPath, 'utf8');
    }
    // check group file
    const pathOfGroupInclude = arg.datapath(`/src/includes/${group}/configures/${include}`);
    if (fs.existsSync(pathOfGroupInclude)) {
      includeFileContent = await fs.readFile(pathOfGroupInclude, 'utf8');
    }
    if (!includeFileContent) {
      throw new Error(`include file ${include} not found, please check your path`);
    }
    const includeConfigs = YAML.parse(includeFileContent);
    if (!includeConfigs) {
      continue;
    }
    // check include configs
    for (const ic of includeConfigs) {
      const ickey = `${ic.direction}${ic.bridgeType}`.toUpperCase();
      if (configure.bridges.findIndex(item => `${item.direction}${item.bridgeType}`.toUpperCase() === ickey) > -1) {
        throw new Error(`duplicated config {direction: ${ic.direction}, bridgeType: ${ic.bridgeType}}`);
      }
    }
    nbdgs.push(...includeConfigs);
  }
  configure.bridges = nbdgs;
}

async function _fillEncryptedPrivateKey(options) {
  const {configure} = options;
  const inputEncryptedPrivateKey = arg.option('encrypted-private-key');
  if (!inputEncryptedPrivateKey) return;
  const bridges = configure.bridges;
  for (const bridge of bridges) {
    if (bridge.encryptedPrivateKey) continue;
    bridge.encryptedPrivateKey = inputEncryptedPrivateKey;
  }
}

async function _fillRpcnodes(options) {
  const {configure, definition} = options;
  const customRpcNodes = configure.rpcnodes ?? [];
  const bridges = configure.bridges;
  for (const bridge of bridges) {
    const [sourceChainName, targetChainName] = bridge.direction.split('->');
    const sourceChainRpc = definition.rpc[sourceChainName];
    const targetChainRpc = definition.rpc[targetChainName];
    __updateRpcnodesRpc(customRpcNodes, {name: sourceChainName, rpc: sourceChainRpc});
    __updateRpcnodesRpc(customRpcNodes, {name: targetChainName, rpc: targetChainRpc});
  }
  configure.rpcnodes = customRpcNodes;
}

function __updateRpcnodesRpc(rpcnodes, detected = {name, rpc}) {
  for (const rpcnode of rpcnodes) {
    if (rpcnode.name !== detected.name) {
      continue;
    }
    if (rpcnode.rpc) return;
    rpcnode.rpc = detected.rpc;
    return;
  }
  rpcnodes.push(detected);
}
