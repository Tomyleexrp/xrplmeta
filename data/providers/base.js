import fetch from 'node-fetch'
import Rest from '../lib/rest.js'
import { log, pretty } from '../lib/logging.js'
import { wait, unixNow } from '../../common/time.js'



export class BaseProvider{
	constructor(name){
		this.log = log.for(name, 'cyan')
	}

	async loopOperation(type, entity, interval, execute){
		while(true){
			await wait(10)

			if(entity){
				let operation = await this.repo.operations.getNext(type, entity)

				if(!operation || (operation.result === 'success' && operation.start + interval > unixNow())){
					await wait(1000)
					continue
				}

				await this.repo.operations.record(
					type, 
					`${entity}:${operation.entity}`, 
					execute(operation.entity)
				)
			}else{
				let recent = await this.repo.operations.getMostRecent(type)

				if(recent && recent.result === 'success' && recent.start + interval > unixNow()){
					await wait(1000)
					continue
				}

				await this.repo.operations.record(type, null, execute())
			}

			
		}
	}

}


export class RestProvider extends BaseProvider{
	constructor(name, cfg){
		super(name)

		this.api = new Rest({fetch, ...cfg})
	}
}
