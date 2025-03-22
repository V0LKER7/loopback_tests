"use strict";

module.exports = function enableAuthentication(app) {
	app.enableAuth();

	// Добавляем все моделям права по умолчанию DENY
	// Раскоментировать когда будут настроены все разрешения
	// app.models().forEach((model) => {
	//   // По умолчанию все запрещать
	//   // Отключать только в случае проблем с правами
	//   model.settings.defaultPermission = app.models.ACL.DENY;
	// });
};
