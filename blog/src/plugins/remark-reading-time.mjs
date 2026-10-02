const WORDS_PER_MINUTE = 200;

export function remarkReadingTime() {
	return (tree, { data }) => {
		let words = 0;
		const walk = (node) => {
			if (node.type === 'text' || node.type === 'inlineCode') {
				words += (node.value.match(/\S+/g) ?? []).length;
			}
			node.children?.forEach(walk);
		};
		walk(tree);
		data.astro.frontmatter.readingTime = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
	};
}
