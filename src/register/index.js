import * as arg from '../ecosys/arg.js'
import * as safe from '../ecosys/safe.js'
import * as lnv3 from './lnv3.js'
import * as lnv2Default from './lnv2_default.js'
import * as lnv2Opposite from './lnv2_opposite.js'


export async function check() {
  const environments = arg.programArguments();
  if (!environments || !environments.length) {
    console.log(chalk.red('missing network [mainnet|testnet]'));
    process.exit(1);
  }
  const datadir = arg.datadir();
  if (!datadir) {
    console.log(chalk.red('missing datadir, please add --datadir=/path/to/data or -d=/path/to/data'));
    process.exit(1);
  }
  if (!await fs.pathExists(datadir)) {
    console.log(chalk.red(`the datadir [${datadir}] not exists`));
    process.exit(1);
  }
  if (!$.env['SIGNER']) {
    console.log(chalk.red('missing signer'));
    process.exit(1);
  }
  const deps = ['cast', 'sha256sum', 'cut'];
  for (const dep of deps) {
    const depath = await which(dep);
    if (!depath) {
      console.log(chalk.red(`missing ${dep}`));
      process.exit(1);
    }
  }
}


export async function register(options) {
  await init(options);

  const enableMainnet = arg.option('mainnet');
  const enableTestnet = arg.option('testnet');
  if (!enableMainnet && !enableTestnet) {
    console.log(chalk.red('missing product mode, please add --mainnet or --testnet'));
    process.exit(1);
  }

  if (enableMainnet) {
    await registerWithType(options, 'mainnet');
  }
  if (enableTestnet) {
    await registerWithType(options, 'testnet');
  }
}

async function init(options) {
  const defYmlRaw = await fs.readFile(arg.datapath('/definition.yml'), 'utf8');
  options.definition = YAML.parse(defYmlRaw);
}


async function registerWithType(options, type) {
  const bridgeConfigRaw = await fs.readFile(arg.datapath(`/bridges.${type}.yml`), 'utf8');
  const bridgeConfig = YAML.parse(bridgeConfigRaw);
  const registers = bridgeConfig.registers;

  for (const register of registers) {
    console.log(`==> start register [${register.type}] [${register.symbol}] ${register.bridge}`);
    await handle({
      ...options,
      register,
    });
    console.log('-----------------------')
    console.log('')
    console.log('')
  }
}

async function handle(options) {
  const {definition, register} = options;
  const [sourceChainName, targetChainName] = register.bridge.split('->');
  const sourceChainRpc = definition.rpc[sourceChainName];
  const targetChainRpc = definition.rpc[targetChainName];
  if (!sourceChainRpc) {
    console.log(chalk.red(`unidentified chain: ${sourceChainName}`));
    process.exit(1);
  }
  if (!targetChainRpc) {
    console.log(chalk.red(`unidentified chain: ${targetChainName}`));
    process.exit(1);
  }
  options.lifecycle = {
    sourceChainName: sourceChainName,
    targetChainName: targetChainName,
    sourceChainRpc: sourceChainRpc,
    targetChainRpc: targetChainRpc,
  };

  await safe.init(options);
  const hash = await hashRegister(register);
  const ensureLockOptions = {
    register,
    hash,
  };
  if (await ensureLock(ensureLockOptions)) {
    console.log(chalk.yellow(`the bridge ${_identifyRegisterName(register)} already registered.`));
    return;
  }

  switch (register.type) {
    case 'lnv3':
      await lnv3.register(options);
      break;
    case 'lnv2-default':
      await lnv2Default.register(options);
      break;
    case 'lnv2-opposite':
      await lnv2Opposite.register(options);
      break;
  }
  await ensureLock(ensureLockOptions, true);
  console.log(chalk.green(`the bridge ${_identifyRegisterName(register)} registered`));
}

async function hashRegister(register) {
  const keys = Object.keys(register);
  keys.sort();
  let merged = '';
  for (const key of keys) {
    merged += register[key];
  }
  const hash = await $`echo "${merged}" | sha256sum | cut -d ' ' -f1`;
  return {
    origin: merged,
    hash: hash.stdout.trim(),
  }
}

async function ensureLock(options, write = false) {
  const {register} = options;
  const irn = _identifyRegisterName(register);
  const LOCK_PATH = arg.datapath('/lock');
  const lockName = `${LOCK_PATH}/${irn}.lock.json`;
  if (write) {
    await $`mkdir -p ${LOCK_PATH}`;
    const outputJson = JSON.stringify(options, null, 2);
    await fs.writeFile(lockName, outputJson);
    console.log(`write lock: ${lockName}`);
    return true;
  }

  if (!await fs.pathExists(lockName)) {
    return false;
  }

  const lockedRegisterData = await fs.readJson(lockName);
  if (lockedRegisterData.hash.hash !== options.hash.hash) {
    console.log(chalk.magenta(`detect changes for bridge ${irn} register it again`));
    return false;
  }

  return true;
}

function _identifyRegisterName(register) {
  return `${register.type}__${register.symbol}__${register.bridge.replace('->', '_')}`;
}

