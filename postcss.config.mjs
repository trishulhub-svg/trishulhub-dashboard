// PostCSS config — empty during Vitest runs
const isVitest = process.env.VITEST === "true" || process.env.NODE_ENV === "test"
const config = {
  plugins: isVitest ? [] : ["@tailwindcss/postcss"],
}
export default config
