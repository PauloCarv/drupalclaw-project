import { type CollectionEntry, getCollection, render } from 'astro:content';

export type Post = CollectionEntry<'blog'> & { readingTime: number };

export async function getPosts(): Promise<Post[]> {
	const entries = (await getCollection('blog')).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);
	return Promise.all(
		entries.map(async (entry) => {
			const { remarkPluginFrontmatter } = await render(entry);
			return { ...entry, readingTime: Number(remarkPluginFrontmatter.readingTime ?? 1) };
		}),
	);
}
