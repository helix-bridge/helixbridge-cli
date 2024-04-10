
export async function init(BIN_PATH) {
  const signer = $.env['SIGNER'];

  const defYmlRaw = await fs.readFile(`${BIN_PATH}/ecosys/definition.yml`, 'utf8');

  return {
    BIN_PATH,
    signer,
    definition: YAML.parse(defYmlRaw),
  };
}
