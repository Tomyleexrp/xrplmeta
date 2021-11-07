import { wait, unixNow } from '../../../common/time.js'


export async function getNext(type, entity){
	let table = 'Issuers'

	return await this.db.get(
		`SELECT
			Operations.*, ${table}.id as entity
		FROM
			${table}
			LEFT JOIN Operations
				ON 
					Operations.type = ?
					AND
					Operations.subject = (? || ':' || ${table}.id)
		GROUP BY
			Operations.subject
		ORDER BY
			(CASE WHEN start IS NULL THEN 1 ELSE 0 END) DESC,
			MAX(start) ASC`,
		type, entity
	)
}

export async function hasCompleted(type, subject){
	let operation = await this.operations.getMostRecent(type, subject)

	if(operation && operation.result === 'success')
		return true

	return false
}

export async function getMostRecent(type, subject){
	if(subject){
		return await this.db.get(
			`SELECT * 
			FROM Operations 
			WHERE type=? AND subject=?
			ORDER BY start DESC`, 
			type, subject
		)
	}else{
		return await this.db.get(
			`SELECT * 
			FROM Operations 
			WHERE type=?
			ORDER BY start DESC`, 
			type
		)
	}
}

export async function record(type, subject, promise){
	let start = unixNow()
	let result

	try{
		await promise
		result = 'success'
	}catch(error){
		if(subject)
			this.log(`operation "${type}/${subject}" failed: ${error.toString()}`)
		else
			this.log(`operation "${type}" failed: ${error.toString()}`)

		await wait(3000)

		result = `error: ${error.toString()}`
	}

	let mostRecent = await this.operations.getMostRecent(type, subject)

	if(mostRecent){
		await this.db.run(
			`DELETE FROM Operations
			WHERE id = ?`,
			mostRecent.id
		)
	}

	await this.operations.mark(type, subject, start, result)
}

export async function mark(type, subject, start, result){
	await this.db.insert('Operations', {
		type,
		subject,
		start,
		end: unixNow(),
		result
	})
}