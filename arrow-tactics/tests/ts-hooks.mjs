// Resolution des imports sans extension des sources TS du projet (node --import ./ts-register.mjs).
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (err) {
    if ((specifier.startsWith('.') || specifier.startsWith('file:')) && !/\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context);
    throw err;
  }
}
