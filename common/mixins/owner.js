var loopbackContext = require("loopback-context");
var debug = require("debug")("smartplatform:mixin:owner");

/**
 * Данный mixin позволяет добавлять функционал хозяев для объектов моделей.
 * У модели появляется новое поле ownerId, который выставляется равным пользователю
 * который создал этот объект.
 */
module.exports = function (Model, options) {
	// Добавляем поле ownerId указавающее на пользователя
	Model.belongsTo("User", {
		as: "owner",
		foreignKey: "ownerId",
	});

	// Автоматическое присвоение ownerId для новых объектов
	Model.observe("before save", function (context, next) {
		let accessToken = context.options.accessToken;

		// Если сохраняет авторизованный пользователь и это новый объект
		// то заполняем ownerId текущим пользователем
		if (context.isNewInstance && accessToken) {
			context.instance.ownerId = accessToken.userId;
		}

		next();
	});
};
