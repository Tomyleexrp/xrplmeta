import { sum, sub, eq, lt, gt, neg, max } from '@xrplkit/xfl'
import { writeBalance } from '../../../db/helpers/balances.js'
import { writeTokenMetrics, readTokenMetrics } from '../../../db/helpers/tokenmetrics.js'


export function parse({ entry }){
	let lowIssuer = entry.HighLimit.value !== '0' || lt(entry.Balance.value, '0')
	let highIssuer = entry.LowLimit.value !== '0' || gt(entry.Balance.value, '0')
	let transformed = {}

	if(lowIssuer){
		transformed.low = {
			account: { 
				address: entry.HighLimit.issuer 
			},
			token: {
				currency: entry.Balance.currency,
				issuer: {
					address: entry.LowLimit.issuer
				}
			},
			balance: max(0, neg(entry.Balance.value)),
			previousSequence: entry.PreviousTxnLgrSeq
		}
	}

	if(highIssuer){
		transformed.high = {
			account: { 
				address: entry.LowLimit.issuer 
			},
			token: {
				currency: entry.Balance.currency,
				issuer: {
					address: entry.HighLimit.issuer
				}
			},
			balance: max(0, entry.Balance.value),
			previousSequence: entry.PreviousTxnLgrSeq
		}
	}

	return transformed
}


export function group({ previous, final }){
	let groups = []

	for(let side of ['low', 'high']){
		let entry = final
			? final[side]
			: previous[side]

		if(!entry)
			continue

		groups.push({
			group: {
				token: entry.token,
				key: `${entry.token.currency}:${entry.token.issuer.address}`,
			},
			previous: previous ? previous[side] : undefined,
			final: final ? final[side] : undefined
		})
	}

	return groups
}


export function diff({ ctx, token, deltas }){
	token = ctx.db.tokens.createOne({
		data: token
	})

	let metrics = {
		trustlines: 0,
		holders: 0,
		supply: 0,
		...readTokenMetrics({ 
			ctx, 
			token, 
			ledgerSequence: ctx.ledgerSequence,
			metrics: {
				trustlines: true,
				holders: true,
				supply: true
			}
		})
	}

	for(let { previous, final } of deltas){
		if(previous && final){
			metrics.supply = sum(
				metrics.supply,
				sub(final.balance, previous.balance)
			)

			if(eq(previous.balance, 0) && gt(final.balance, 0)){
				metrics.holders++
			}else if(eq(final.balance, 0) && gt(previous.balance, 0)){
				metrics.holders--
			}
		}else if(final){
			metrics.trustlines++

			if(gt(final.balance, 0)){
				metrics.supply = sum(metrics.supply, final.balance)
				metrics.holders++
			}
		}else{
			metrics.trustlines--

			if(gt(previous.balance, 0)){
				metrics.supply = sub(metrics.supply, previous.balance)
				metrics.holders--
			}
		}

		writeBalance({
			ctx,
			account: final.account || previous.account,
			token,
			ledgerSequence: ctx.ledgerSequence,
			balance: final
				? final.balance
				: '0'
		})

		ctx.affectedScope({
			account: final.account || previous.account,
			change: 'balances'
		})
	}
	
	writeTokenMetrics({
		ctx,
		token,
		ledgerSequence: ctx.ledgerSequence,
		metrics
	})

	ctx.affectedScope({
		token,
		change: 'metrics'
	})
}