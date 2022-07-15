import { sub, mul, div, min, gt } from '@xrplkit/xfl'
import { unixNow } from '@xrplkit/time'
import { readLedgerAt, readMostRecentLedger } from './ledgers.js'
import { readTokenMetrics } from './tokenmetrics.js'
import { readTokenExchangeAligned, readTokenVolume } from './tokenexchanges.js'


const maxChangePercent = 999999999
const metricInts = ['trustlines', 'holders']


export function updateCacheForTokenProps({ ctx, token }){
	let props = ctx.db.tokenProps.readMany({
		where: {
			token
		}
	})
		.map(({ key, value, source }) => ({ key, value, source }))

	ctx.db.tokenCache.createOne({
		data: {
			token,
			tokenProps: props,
			trusted: props.some(
				({ key, value }) => key === 'trusted' && value === true
			)
		}
	})
}

export function updateCacheForAccountProps({ ctx, account }){
	let tokens = ctx.db.tokens.readMany({
		where: {
			issuer: account
		}
	})

	for(let token of tokens){
		ctx.db.tokenCache.createOne({
			data: {
				token,
				issuerProps: ctx.db.accountProps.readMany({
					where: {
						account
					}
				})
					.map(({ key, value, source }) => ({ key, value, source }))
			}
		})
	}
}

export function updateCacheForTokenMetrics({ ctx, token, metrics }){
	let cache = {}
	let sequences = getCommonLedgerSequences({ ctx })

	let currentValues = readTokenMetrics({
		ctx,
		token,
		metrics,
		ledgerSequence: sequences.current
	})

	let pre24hValues = readTokenMetrics({
		ctx,
		token,
		metrics,
		ledgerSequence: sequences.pre24h
	})

	let pre7dValues = readTokenMetrics({
		ctx,
		token,
		metrics,
		ledgerSequence: sequences.pre7d
	})

	for(let key of Object.keys(metrics)){
		let current = currentValues[key] || 0
		let pre24h = pre24hValues[key] || 0
		let pre7d = pre7dValues[key] || 0
		let delta24h = sub(current, pre24h)
		let delta7d = sub(current, pre7d)

		let percent24h = gt(pre24h, 0)
			? Number(min(mul(div(delta24h, pre24h), 100), maxChangePercent))
			: 0

		let percent7d = gt(pre7d, 0)
			? Number(min(mul(div(delta7d, pre7d), 100), maxChangePercent))
			: 0

		if(metricInts.includes(key)){
			delta24h = Number(delta24h)
			delta7d = Number(delta7d)
		}

		cache[key] = current
		cache[`${key}Delta24H`] = delta24h
		cache[`${key}Percent24H`] = percent24h
		cache[`${key}Delta7D`] = delta7d
		cache[`${key}Percent7D`] = percent7d
	}

	ctx.db.tokenCache.createOne({
		data: {
			token,
			...cache
		}
	})
}

export function updateCacheForTokenExchanges({ ctx, token }){
	if(token.currency === 'XRP')
		return

	let sequences = getCommonLedgerSequences({ ctx })

	let current = readTokenExchangeAligned({
		ctx,
		base: token,
		quote: {
			currency: 'XRP'
		},
		ledgerSequence: sequences.current
	})?.price || 0

	let pre24h = readTokenExchangeAligned({
		ctx,
		base: token,
		quote: {
			currency: 'XRP'
		},
		ledgerSequence: sequences.pre24h
	})?.price || 0

	let pre7d = readTokenExchangeAligned({
		ctx,
		base: token,
		quote: {
			currency: 'XRP'
		},
		ledgerSequence: sequences.pre7d
	})?.price || 0

	let delta24h = sub(current, pre24h)
	let delta7d = sub(current, pre7d)

	let percent24h = gt(pre24h, 0)
		? Number(min(mul(div(delta24h, pre24h), 100), maxChangePercent))
		: 0

	let percent7d = gt(pre7d, 0)
		? Number(min(mul(div(delta7d, pre7d), 100), maxChangePercent))
		: 0

	let volume24H = readTokenVolume({
		ctx,
		base: token,
		quote: {
			id: 1,
			currency: 'XRP'
		},
		sequenceStart: sequences.pre24h,
		sequenceEnd: sequences.current
	})

	let volume7D = readTokenVolume({
		ctx,
		base: token,
		quote: {
			id: 1,
			currency: 'XRP'
		},
		sequenceStart: sequences.pre7d,
		sequenceEnd: sequences.current
	})

	ctx.db.tokenCache.createOne({
		data: {
			token,
			price: current,
			pricePercent24H: percent24h,
			pricePercent7D: percent7d,
			volume24H,
			volume7D
		}
	})
}


function getCommonLedgerSequences({ ctx }){
	let now = unixNow()
	
	return {
		current: readMostRecentLedger({ ctx }).sequence,
		pre24h: readLedgerAt({ 
			ctx, 
			time: now - 60 * 60 * 24, 
			clamp: true 
		}).sequence,
		pre7d: readLedgerAt({ 
			ctx, 
			time: now - 60 * 60 * 24 * 7, 
			clamp: true 
		}).sequence
	}
}