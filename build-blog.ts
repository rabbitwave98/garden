
const postsDir = "./content/posts";
const outputFile = "./blog-posts.json";

type BlogPost = {
  title: string;
  date: string;
  tags: string[];
  content: string;
  slug: string;
};

const posts: BlogPost[] = [];

for await (const entry of Deno.readDir(postsDir)) {
  if (!entry.isFile || !entry.name.endsWith(".md")) continue;

  const markdown = await Deno.readTextFile(
    `${postsDir}/${entry.name}`,
  );

  const match = markdown.match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  );

  let title = entry.name.replace(/\.md$/, "");
  let date = "";
  let tags: string[] = [];
  let content = markdown;

  if (match) {
    const frontMatter = match[1];
    content = markdown.slice(match[0].length);

    const titleMatch = frontMatter.match(/^title:\s*(.*?)\s*$/m);
    const dateMatch = frontMatter.match(/^date:\s*(.*?)\s*$/m);

    if (titleMatch) {
      title = titleMatch[1].replace(/^["']|["']$/g, "");
    }

    if (dateMatch) {
      date = dateMatch[1].replace(/^["']|["']$/g, "");
    }

    // Read tags as either a YAML list or an inline array.
    const lines = frontMatter.split(/\r?\n/);
    const tagsIndex = lines.findIndex((line) =>
      /^tags:\s*/.test(line)
    );

    if (tagsIndex !== -1) {
      const tagsLine = lines[tagsIndex].replace(/^tags:\s*/, "").trim();

      if (tagsLine.startsWith("[") && tagsLine.endsWith("]")) {
        // Example: tags: [personal, writing]
        tags = tagsLine
          .slice(1, -1)
          .split(",")
          .map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      } else if (tagsLine) {
        // Example: tags: personal
        tags = [tagsLine.replace(/^["']|["']$/g, "")];
      } else {
        // Example:
        // tags:
        //   - personal
        //   - writing
        for (let i = tagsIndex + 1; i < lines.length; i++) {
          const line = lines[i];

          // Stop when the next top-level YAML property begins.
          if (/^\S[^:]*:\s*/.test(line)) break;

          const tagMatch = line.match(/^\s+-\s+(.*?)\s*$/);

          if (tagMatch && tagMatch[1]) {
            tags.push(
              tagMatch[1].replace(/^["']|["']$/g, ""),
            );
          }
        }
      }
    }
  }

  posts.push({
    title,
    date,
    tags,
    content,
    slug: entry.name.replace(/\.md$/, ""),
  });
}

posts.sort((a, b) => {
  const dateOrder = b.date.localeCompare(a.date);
  return dateOrder || a.slug.localeCompare(b.slug);
});

await Deno.writeTextFile(
  outputFile,
  JSON.stringify(posts, null, 2),
);

console.log(`Published ${posts.length} posts to ${outputFile}`);
