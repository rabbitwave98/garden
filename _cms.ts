
import lumeCMS from "lume/cms/mod.ts";

const cms = lumeCMS({
  site: {
    name: "My Website CMS",
    description: "Manage my website pages and blog content."
  }
});

cms.storage("site", ".");

cms.collection({
  name: "posts",
  label: "Blog Posts",
  description: "Create, edit, and delete Markdown blog posts.",
  store: "site:content/posts/*.md",
fields: [
  "title: text!",
  "date: date",
  "tags: list",
  "content: markdown",
],
  documentName: "{title}.md",
  create: true,
  edit: true,
  delete: true,
});

export default cms;
