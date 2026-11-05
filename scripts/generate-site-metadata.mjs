import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const ignoredDirectories = new Set([
    "node_modules", "scripts", "src", "dist", "_site", "test", "tests", "tmp", "output",
]);

function normalizePaths(paths, setting) {
    if (!Array.isArray(paths)) {
        throw new Error(`${setting} must be an array of absolute URL paths.`);
    }

    return [...new Set(paths.map((route) => {
        if (typeof route !== "string" || !route.startsWith("/") ||
            /[\s?#*\\%]/u.test(route) || route.includes("//") ||
            route.split("/").some((segment) => segment === "." || segment === "..")) {
            throw new Error(`Invalid path in ${setting}: ${JSON.stringify(route)}`);
        }

        return route.replace(/\/$/u, "") || "/";
    }))].sort();
}

function escapeXml(value) {
    return value.replace(/[<>&"']/gu, (character) => ({
        "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
    })[character]);
}

function hasNoindex(html) {
    const markup = html.replace(/<!--[\s\S]*?-->/gu, "");

    for (const [tag] of markup.matchAll(/<meta\b[^>]*>/giu)) {
        const attributes = Object.fromEntries(
            [...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gu)]
                .map(([, name, doubleQuoted, singleQuoted, unquoted]) => [
                    name.toLowerCase(), (doubleQuoted ?? singleQuoted ?? unquoted).toLowerCase(),
                ]),
        );

        if (["robots", "googlebot", "bingbot"].includes(attributes.name) &&
            /(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/u.test(attributes.content ?? "")) {
            return true;
        }
    }

    return false;
}

async function findPages(directory, root) {
    const pages = [];

    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const filename = path.join(directory, entry.name);

        if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
            pages.push(...await findPages(filename, root));
        } else if (entry.isFile() && entry.name.endsWith(".html") &&
            !["404.html", "500.html"].includes(entry.name)) {
            const html = await readFile(filename, "utf8");
            if (hasNoindex(html)) continue;

            const relativePath = path.relative(root, filename).split(path.sep).join("/");
            const route = `/${relativePath}`.replace(/\/index\.html$/u, "/");
            pages.push(route);
        }
    }

    return pages;
}

export async function generateMetadata(root = projectRoot) {
    const config = JSON.parse(await readFile(path.join(root, "site.config.json"), "utf8"));
    const siteUrl = new URL(config.siteUrl);

    if (!["https:", "http:"].includes(siteUrl.protocol) || siteUrl.pathname !== "/" ||
        siteUrl.search || siteUrl.hash || siteUrl.username || siteUrl.password) {
        throw new Error("siteUrl must be an HTTP(S) origin without a path, query, or credentials.");
    }

    const disallowed = normalizePaths(config.robots?.disallow ?? [], "robots.disallow");
    const excluded = [
        ...normalizePaths(config.sitemap?.exclude ?? [], "sitemap.exclude"),
        ...disallowed,
    ];
    const routes = [...new Set(await findPages(root, root))].filter((route) =>
        !excluded.some((prefix) => route.startsWith(prefix)),
    ).sort();
    const locations = routes.map((route) =>
        `${siteUrl.origin}${route.split("/").map(encodeURIComponent).join("/")}`,
    );
    const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...locations.map((location) => `    <url><loc>${escapeXml(location)}</loc></url>`),
        "</urlset>", "",
    ].join("\n");

    if (locations.length > 50000 || Buffer.byteLength(sitemap) > 50 * 1024 * 1024) {
        throw new Error("Sitemap exceeds protocol limits; split it into a sitemap index first.");
    }

    const robots = [
        "# Generated from site.config.json. Do not edit directly.",
        "User-agent: *",
        ...disallowed.map((route) => `Disallow: ${route.split("/").map(encodeURIComponent).join("/")}`),
        "", `Sitemap: ${siteUrl.origin}/sitemap.xml`, "",
    ].join("\n");

    return { "sitemap.xml": sitemap, "robots.txt": robots };
}

async function main() {
    const args = process.argv.slice(2);
    if (args.some((argument) => argument !== "--check")) {
        throw new Error("Usage: node scripts/generate-site-metadata.mjs [--check]");
    }

    for (const [filename, content] of Object.entries(await generateMetadata())) {
        const destination = path.join(projectRoot, filename);
        const existing = await readFile(destination, "utf8").catch((error) => {
            if (error.code === "ENOENT") return null;
            throw error;
        });

        if (existing === content) continue;
        if (args.includes("--check")) {
            throw new Error(`${filename} is missing or outdated. Run node scripts/generate-site-metadata.mjs`);
        }

        await writeFile(destination, content);
        console.log(`Generated ${filename}`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
