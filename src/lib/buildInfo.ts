/** Short git sha of this bundle. `dev` when the build could not read git. */
export const BUILD_SHA = ((import.meta.env.VITE_BUILD_SHA as string | undefined) || 'dev').slice(0, 7)
