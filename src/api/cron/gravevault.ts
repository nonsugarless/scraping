import chrome from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

import postSlackMessage from '../../utils/postSlackMessage';

import type { VercelApiHandler } from '@vercel/node';

const PAGE_URL =
	'https://www.gravevault.jp/index.php?dispatch=products.view&product_id=764';
const SELECTOR = '#out_of_stock_info_2934680252';
const SLACK_MESSAGE_TAG = '`Gravevault`';

const LOCAL_CHROME_EXEC_PATH =
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const isLocal = process.env.VERCEL_URL?.includes('localhost');

const scraping = async () => {
	const browser = await puppeteer.launch({
		args: chrome.args,
		executablePath: isLocal ? LOCAL_CHROME_EXEC_PATH : await chrome.executablePath,
		headless: chrome.headless,
	});

	const page = await browser.newPage();
	await page.goto(PAGE_URL);
	const selector = await page.waitForSelector(SELECTOR, {
		timeout: 300,
	});
	const textContent = await selector?.getProperty('textContent');
	const value = await textContent?.jsonValue();
	await browser.close();
	if (!value) {
		throw new Error('value is falsy');
	}
	return value;
};

type TimeoutError = {
	name: 'TimeoutError';
};

const handler: VercelApiHandler = async (_req, res) => {
	try {
		const text = await scraping().catch(async (error: TimeoutError | Error) => {
			if (error.name === 'TimeoutError') {
				await postSlackMessage({
					text: 'スクレイピングがtimeoutしました⚠️\nselectorにマッチする要素がないかもしれません🥲',
				});
				res.status(200);
			} else {
				await postSlackMessage({
					text: 'スクレイピングで予期せぬエラーが発生しました😢',
				});
				res.status(400).json({ error });
			}
		});
		if (typeof text !== 'string') {
			return;
		}
		const hasStock = !text.includes('在庫がありません');
		const baseData = {
			text,
			hasStock,
		};
		const slackRes = await postSlackMessage({
			text: hasStock
				? `${SLACK_MESSAGE_TAG} 目当ての商品が入荷されました🎉`
				: `${SLACK_MESSAGE_TAG} 在庫なし`,
		});
		res.status(200).json({
			...baseData,
			slackResStatus: slackRes.status,
		});
	} catch (error) {
		if (error instanceof Error) {
			res.status(400).json({ error });
		}
	}
};

export default handler;
