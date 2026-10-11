
import lumeCMS from "lume/cms/mod.ts";

const cms = lumeCMS({
  site: {
    name: "rabbitwave98 + lumecms",
    description: "yuh"
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

cms.collection({
  name: "garden",
  label: "Garden",
  description: "Create, edit, and delete Markdown garden entries.",
  store: "site:garden/*.md",
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
