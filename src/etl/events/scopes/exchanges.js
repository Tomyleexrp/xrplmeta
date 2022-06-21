import log from '@mwni/log'
import { extractExchanges } from '@xrplkit/txmeta'
import { div } from '@xrplkit/xfl'


export function extractTokenExchanges({ ctx, ledger }){
	let subjects = {}
	let exchanges = []

	for(let transaction of ledger.transactions){
		exchanges.push(...extractExchanges(transaction))
	}

	if(exchanges.length === 0)
		return

	for(let { hash, sequence, maker, taker, takerPaid, takerGot } of exchanges){
		let takerPaidToken = {
			currency: takerPaid.currency,
			issuer: takerPaid.issuer
				? { address: takerPaid.issuer }
				: undefined
		}

		let takerGotToken = {
			currency: takerGot.currency,
			issuer: takerGot.issuer
				? { address: takerGot.issuer }
				: undefined
		}

		
		for(let token of [takerPaidToken, takerGotToken]){
			if(token.issuer)
				subjects = {
					...subjects,
					[`${token.currency}:${token.issuer.address}`]: {
						type: 'Token',
						token
					}
				}
		}

		ctx.meta.tokenExchanges.createOne({
			data: {
				txHash: hash,
				ledgerSequence: ledger.sequence,
				taker: {
					address: taker
				},
				maker: {
					address: maker
				},
				sequence,
				takerPaidToken,
				takerGotToken,
				takerPaidValue: takerPaid.value,
				takerGotValue: takerGot.value,
			}
		})
	}

	log.accumulate.info({
		text: [
			`recorded %tokenExchanges exchanges in %time`
		],
		data: {
			tokenExchanges: exchanges.length
		}
	})

	return subjects
}


export function read({ ctx, base, quote, takerGot, ledgerSequence }){
	let exchange = ctx.meta.tokenExchanges.readOne({
		where: {
			OR: [
				{
					takerPaidToken: base,
					takerGotToken: quote
				},
				{
					takerPaidToken: quote,
					takerGotToken: base
				}
			],
			ledgerSequence: {
				lessOrEqual: ledgerSequence
			}
		},
		orderBy: {
			ledgerSequence: 'desc'
		}
	})

	if(!exchange)
		return

	return align({ base, quote, exchange })
}

export function align({ base, quote, exchange }){
	let { takerPaidToken, takerGotToken, takerPaidValue, takerGotValue, ...props } = exchange

	if(
		takerPaidToken.currency === base.currency && 
		takerPaidToken.issuer?.address === base.issuer?.address
	){
		return {
			...props,
			price: div(takerGotValue, takerPaidValue),
			volume: takerPaidValue
		}
	}else{
		return {
			...props,
			price: div(takerPaidValue, takerGotValue),
			volume: takerGotValue
		}
	}
}