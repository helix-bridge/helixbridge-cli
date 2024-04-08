export async function init() {
  const signer = $.env['SIGNER'];
  return {signer};
}
