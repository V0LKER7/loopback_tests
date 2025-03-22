const loopbackContext = require("loopback-context");
const async = require("async");
const debug = require("debug")("smartplatform:mixin:member");

/**
 * Формирует подзапрос для связанных объектов
 */
let getWhere = function (Model, relation, userId) {
	let where = "",
		keyFrom;
	let booleanValue = true;

	let relationName =
		Array.isArray(relation) && relation.length > 0 ? relation[0] : relation;

	if (relationName[0] == "!") {
		relationName = relationName.substr(1);
		booleanValue = false;
	}

	// Если реляция это булевое поле модели, то добавляем его проверку,
	// для случаев когда нужно иметь ограничение на видимость по условию
	if (
		Model.definition.properties[relationName] &&
		Model.definition.properties[relationName].type === Boolean
	) {
		where = `("${Model.modelName}"."${relationName}" is ${
			booleanValue ? "" : "not"
		} true `;
		if (Array.isArray(relation) && relation.length > 1) {
			relation = relation.slice(1);
			where += ` and (${getWhere(Model, relation, userId)})`;
		} else {
			relation = null;
		}
		where += ") ";
	} else {
		if (Array.isArray(relation) && relation.length > 1) {
			let modelTo = Model.relations[relationName].modelTo;
			let modelThrough = Model.relations[relationName].modelThrough;

			if (modelThrough) {
				// для связей многие-ко-многим нужен дополнительный запрос через промежуточную таблицу
				where += `"${Model.modelName}".${
					Model.relations[relationName].keyFrom
				} in (
					select distinct "${modelThrough.modelName}".${
					Model.relations[relationName].keyTo
				}
					from public."${modelThrough.modelName}"
					where "${modelThrough.modelName}".${
					Model.relations[relationName].keyThrough
				} in (
						select distinct "${modelTo.modelName}".${modelTo.getIdName()}
						from public."${modelTo.modelName}"
						where ${getWhere(
							modelTo,
							relation.slice(1),
							userId,
							Model.relations[relationName].keyTo
						)}
					)
				)`;
			} else {
				where += `"${Model.modelName}".${
					Model.relations[relationName].keyFrom
				} in (
					select distinct "${modelTo.modelName}".${Model.relations[relationName].keyTo}
					from public."${modelTo.modelName}"
					where ${getWhere(
						modelTo,
						relation.slice(1),
						userId,
						Model.relations[relationName].keyTo
					)}
				)`;
			}
		} else if (relation) {
			keyFrom = Model.relations[relationName]
				? Model.relations[relationName].keyFrom
				: relationName;
			where += `${keyFrom} = ${userId}`;
		}
	}

	return where;
};

/**
 * Формирует запрос для связанных объектов
 */
let checkMember = function (
	Model,
	relations,
	userId,
	modelId,
	context,
	callback
) {
	let modelName = Model.modelName;
	let connector = Model.getDataSource().connector;
	let join = [];
	let where = [];
	let sql;
	let sqlContext = "";

	if (context && context.query.where) {
		sqlContext = Model.dataSource.connector.buildWhere(
			Model.modelName,
			context.query.where
		);
	}

	relations.forEach(function (relation) {
		where.push(getWhere(Model, relation, userId));
	});

	sqlContext = connector.parameterize(sqlContext);

	sql = `
		select distinct "${modelName}".id from public."${modelName}"
		${
			sqlContext && sqlContext.sql ? sqlContext.sql + " and" : "where"
		} (${where.join(" or\n")}) ${modelId ? ` and id = ${modelId}` : ""}
	`.toLowerCase();

	connector.execute(sql, sqlContext.params || [], function (error, result) {
		error && console.log({ name: "checkMember error:", error }, sql);
		// console.error('members model ids:', sql, result);
		callback(error, result);
	});
};

/**
 * Позволяет ограничить видимость объектов по принадлежности к пользователю,
 * запрашивающему объекты модели
 * Настройки:
 * "Member": {
 *     "relations": [ // связи модели определяющие принадлежность к пользователю, ниже примеры
 *         "ownerid", // все объекты у которых ownerId = запрашивающий пользователь
 *         ["members", "userId"] // путь к пользователю через связанные модели
 *         ["isPrivate", "ownerId"] // если задача приватная (isPrivateTrue) то ее видят только owner
 *     ],
 *     "roles": [     // список названий ролей для которых показываются все объекты
 *         "admin"    // все пользователи с ролью admin будут видеть все объекты
 *     ]
 * }
 */
module.exports = function (Model, options) {
	let relations = options.relations || [];
	let roles = options.roles || [];

	/**
	 * Данные метод вызывается из динамической роли $member, для проверки принадлежности
	 * пользователя к объекты или модели
	 */
	Model.isMember = function (context, callback) {
		if (context.accessToken) {
			if (context.modelId) {
				// console.error('ismember context:', context);
				checkMember(
					Model,
					relations,
					context.accessToken.userId,
					context.modelId,
					context,
					function (error, result) {
						callback(null, result.length > 0);
					}
				);
			} else {
				callback(null, true);
			}
		} else {
			callback(null, false);
		}
	};

	/**
	 * Ограничиваем набор возвращаемых объектов только для их участников
	 */
	Model.observe("access", function (context, next) {
		let accessToken = context.options.accessToken;

		// проверяем авторизован ли пользователь
		if (accessToken) {
			let userId = accessToken.userId;
			let accessContext = { principals: [{ type: "USER", id: userId }] };

			async.some(
				roles,
				function (role, callback) {
					context.Model.app.models.Role.isInRole(
						role,
						accessContext,
						function (error, isInRole) {
							callback(isInRole);
						}
					);
				},
				function (isInRole) {
					if (isInRole) {
						// ничего не меняем, возвращаем все объекты
						next();
					} else {
						// возвращаем только объекты с членством
						checkMember(
							Model,
							relations,
							userId,
							undefined,
							context,
							function (error, result) {
								if (!error) {
									// console.error('access member context:', context);
									let ids = result.map(function (row) {
										return row.id;
									});
									if (ids.length > 0) {
										context.query.where = {
											id: { inq: ids },
										};
									} else {
										// console.error('Problem with mixin member, no records found!');
										context.query.where = { id: null };
									}
									// console.log('context.query.where...', context.query.where);
								}
								next();
							}
						);
					}
				}
			);
		} else {
			// если не авторизован отрабатываем как определено в правах
			// данный случай возможен если разрешен доступ к объектам для не авторизованных
			// пользователей
			next();
		}
	});
};
