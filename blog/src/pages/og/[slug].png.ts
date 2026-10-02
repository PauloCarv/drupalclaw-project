import type { APIRoute, GetStaticPaths } from 'astro';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import satori from 'satori';
import { SITE_TITLE } from '../../consts';
import { getPosts } from '../../lib/posts';

const WIDTH = 1200;
const HEIGHT = 630;

export const getStaticPaths = (async () => {
	const posts = await getPosts();
	return [
		{ params: { slug: 'default' }, props: { title: SITE_TITLE, tag: 'Blog', date: '' } },
		...posts.map((post) => ({
			params: { slug: post.id },
			props: {
				title: post.data.title,
				tag: post.data.tag ?? 'Article',
				date: post.data.pubDate.toLocaleDateString('en-us', {
					year: 'numeric',
					month: 'short',
					day: 'numeric',
				}),
			},
		})),
	];
}) satisfies GetStaticPaths;

const root = process.cwd();
const loadFont = (file: string) => readFile(path.join(root, 'src/assets/fonts', file));

export const GET: APIRoute = async ({ props }) => {
	const { title, tag, date } = props as { title: string; tag: string; date: string };
	const [regular, bold, logo] = await Promise.all([
		loadFont('atkinson-regular.woff'),
		loadFont('atkinson-bold.woff'),
		readFile(path.join(root, 'public/logo.png')),
	]);
	const logoSrc = `data:image/png;base64,${logo.toString('base64')}`;
	const meta = [tag, date].filter(Boolean).join('  ·  ');

	const tree = {
		type: 'div',
		props: {
			style: {
				width: '100%',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'space-between',
				padding: '72px',
				background: 'linear-gradient(135deg, #0a0e1a 0%, #111827 100%)',
				color: '#e2e8f4',
				fontFamily: 'Atkinson',
			},
			children: [
				{
					type: 'div',
					props: {
						style: { display: 'flex', alignItems: 'center', gap: '16px', fontSize: 32, fontWeight: 700, color: '#ffffff' },
						children: [
							{ type: 'img', props: { src: logoSrc, width: 56, height: 56 } },
							{ type: 'span', props: { children: 'DrupalClaw' } },
						],
					},
				},
				{
					type: 'div',
					props: {
						style: { display: 'flex', flexDirection: 'column', gap: '24px' },
						children: [
							{ type: 'div', props: { style: { fontSize: 28, color: '#a9b6cf' }, children: meta } },
							{
								type: 'div',
								props: {
									style: { fontSize: title.length > 60 ? 60 : 72, fontWeight: 700, lineHeight: 1.1, color: '#ffffff' },
									children: title,
								},
							},
						],
					},
				},
				{
					type: 'div',
					props: {
						style: { display: 'flex', height: '8px', width: '100%', background: 'linear-gradient(90deg, #0678be, #2dd4bf)', borderRadius: '4px' },
					},
				},
			],
		},
	};

	const svg = await satori(tree as Parameters<typeof satori>[0], {
		width: WIDTH,
		height: HEIGHT,
		fonts: [
			{ name: 'Atkinson', data: regular, weight: 400, style: 'normal' },
			{ name: 'Atkinson', data: bold, weight: 700, style: 'normal' },
		],
	});
	const png = await sharp(Buffer.from(svg)).png().toBuffer();
	return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
