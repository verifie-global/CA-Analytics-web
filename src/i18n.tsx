import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  LocaleCode,
  UiLocaleOption,
  UiLocalizationOptionsResponse,
} from "./types";

export const LOCALE_STORAGE_KEY = "ca-analytics-locale";

export const BUILTIN_LOCALIZATION_OPTIONS: UiLocalizationOptionsResponse = {
  defaultLocale: "en",
  supportedLocales: [
    { code: "en", englishName: "English", nativeName: "English", textDirection: "ltr" },
    { code: "hy", englishName: "Armenian", nativeName: "Հայերեն", textDirection: "ltr" },
    { code: "ru", englishName: "Russian", nativeName: "Русский", textDirection: "ltr" },
  ],
};

const messages = {
  "Happy": { hy: "Ուրախ", ru: "Радость" },
  "Angry": { hy: "Զայրացած", ru: "Злость" },
  "Frustrated": { hy: "Հիասթափված", ru: "Раздражение" },
  "Stress": { hy: "Սթրես", ru: "Стресс" },
  "Sad": { hy: "Տխուր", ru: "Грусть" },
  "positive": { hy: "դրական", ru: "позитивная" },
  "neutral": { hy: "չեզոք", ru: "нейтральная" },
  "negative": { hy: "բացասական", ru: "негативная" },
  "inbound": { hy: "մուտքային", ru: "входящий" },
  "outbound": { hy: "ելքային", ru: "исходящий" },
  "high": { hy: "բարձր", ru: "высокая" },
  "medium": { hy: "միջին", ru: "средняя" },
  "low": { hy: "ցածր", ru: "низкая" },
  "any": { hy: "ցանկացած", ru: "любой" },
  "Business context": { hy: "Բիզնես համատեքստ", ru: "Бизнес-контекст" },
  "Main goal of call evaluation": { hy: "Զանգի գնահատման հիմնական նպատակ", ru: "Основная цель оценки звонка" },
  "Target business outcome": { hy: "Թիրախային բիզնես արդյունք", ru: "Целевой бизнес-результат" },
  "Sentiment rules": { hy: "Տրամադրության կանոններ", ru: "Правила тональности" },
  "Satisfaction rules": { hy: "Գոհունակության կանոններ", ru: "Правила удовлетворенности" },
  "Friendliness rules": { hy: "Բարյացակամության կանոններ", ru: "Правила дружелюбия" },
  "Resolution rules": { hy: "Լուծման կանոններ", ru: "Правила решения" },
  "Urgency rules": { hy: "Հրատապության կանոններ", ru: "Правила срочности" },
  "Department rules": { hy: "Բաժինների կանոններ", ru: "Правила отделов" },
  "Compliance rules": { hy: "Համապատասխանության կանոններ", ru: "Правила соответствия" },
  "Additional instructions": { hy: "Լրացուցիչ հրահանգներ", ru: "Дополнительные инструкции" },
  "Presence": { hy: "Առկայություն", ru: "Присутствие" },
  "Movement": { hy: "Շարժում", ru: "Движение" },
  "Brightness": { hy: "Պայծառություն", ru: "Яркость" },
  "Warmth": { hy: "Ջերմություն", ru: "Теплота" },
  "Centering": { hy: "Կենտրոնացում", ru: "Центрирование" },
  "Smile": { hy: "Ժպիտ", ru: "Улыбка" },
  "Brow raise": { hy: "Հոնքերի բարձրացում", ru: "Поднятие бровей" },
  "Brow furrow": { hy: "Հոնքերի կիտում", ru: "Нахмуривание бровей" },
  "Eye open": { hy: "Աչքերի բացվածք", ru: "Открытость глаз" },
  "Eye squint": { hy: "Աչքերի կկոցում", ru: "Прищур" },
  "Jaw open": { hy: "Ծնոտի բացվածք", ru: "Открытие челюсти" },
  "Frown": { hy: "Խոժոռում", ru: "Хмурость" },
  "Available": { hy: "Հասանելի", ru: "Доступно" },
  "Experimental": { hy: "Փորձարարական", ru: "Экспериментально" },
  "Adapter Required": { hy: "Պահանջվում է ադապտեր", ru: "Требуется адаптер" },
  "Testing": { hy: "Ստուգվում է", ru: "Проверка" },
  "Connected": { hy: "Միացված է", ru: "Подключено" },
  "Credentials Rejected": { hy: "Մուտքային տվյալները մերժվել են", ru: "Учетные данные отклонены" },
  "Unavailable": { hy: "Անհասանելի", ru: "Недоступно" },
  "Timeout": { hy: "Սպասման ժամանակը սպառվել է", ru: "Время ожидания истекло" },
  "Pending": { hy: "Սպասող", ru: "Ожидает" },
  "User created successfully.": { hy: "Օգտատերը հաջողությամբ ստեղծվեց։", ru: "Пользователь успешно создан." },
  "User updated successfully.": { hy: "Օգտատերը հաջողությամբ թարմացվեց։", ru: "Пользователь успешно обновлен." },
  "User activated successfully.": { hy: "Օգտատերը հաջողությամբ ակտիվացվեց։", ru: "Пользователь успешно активирован." },
  "User deactivated successfully.": { hy: "Օգտատերը հաջողությամբ ապաակտիվացվեց։", ru: "Пользователь успешно деактивирован." },
  "Deactivate {{user}}?": { hy: "Ապաակտիվացնե՞լ {{user}} օգտատիրոջը։", ru: "Деактивировать пользователя {{user}}?" },
  "Enter your company ID and API token to get started.": { hy: "Սկսելու համար մուտքագրեք ընկերության ID-ն և API թոքենը։", ru: "Чтобы начать, введите ID компании и API-токен." },
  "Unable to load call filter options.": { hy: "Չհաջողվեց բեռնել զանգերի զտիչների ընտրանքները։", ru: "Не удалось загрузить параметры фильтров звонков." },
  "Unable to load QA scoring settings.": { hy: "Չհաջողվեց բեռնել QA գնահատման կարգավորումները։", ru: "Не удалось загрузить настройки оценки QA." },
  "Unable to load QA profile.": { hy: "Չհաջողվեց բեռնել QA պրոֆիլը։", ru: "Не удалось загрузить профиль QA." },
  "Unable to load calls.": { hy: "Չհաջողվեց բեռնել զանգերը։", ru: "Не удалось загрузить звонки." },
  "Unable to load call details.": { hy: "Չհաջողվեց բեռնել զանգի մանրամասները։", ru: "Не удалось загрузить детали звонка." },
  "Unable to answer this question.": { hy: "Չհաջողվեց պատասխանել այս հարցին։", ru: "Не удалось ответить на этот вопрос." },
  "Unable to save QA profile.": { hy: "Չհաջողվեց պահպանել QA պրոֆիլը։", ru: "Не удалось сохранить профиль QA." },
  "Unable to save QA scoring settings.": { hy: "Չհաջողվեց պահպանել QA գնահատման կարգավորումները։", ru: "Не удалось сохранить настройки оценки QA." },
  "Unable to recalculate QA score.": { hy: "Չհաջողվեց վերահաշվարկել QA գնահատականը։", ru: "Не удалось пересчитать оценку QA." },
  "Unable to start audio recording.": { hy: "Չհաջողվեց սկսել աուդիո ձայնագրումը։", ru: "Не удалось начать запись аудио." },
  "Unable to upload the recorded audio.": { hy: "Չհաջողվեց վերբեռնել ձայնագրված աուդիոն։", ru: "Не удалось загрузить записанное аудио." },
  "Unable to load audio.": { hy: "Չհաջողվեց բեռնել աուդիոն։", ru: "Не удалось загрузить аудио." },
  "Unable to upload the call.": { hy: "Չհաջողվեց վերբեռնել զանգը։", ru: "Не удалось загрузить звонок." },
  "Unable to export QA monitoring questionnaire.": { hy: "Չհաջողվեց արտահանել QA մոնիթորինգի հարցաշարը։", ru: "Не удалось экспортировать анкету мониторинга QA." },
  "Unable to export calls CSV.": { hy: "Չհաջողվեց արտահանել զանգերի CSV-ն։", ru: "Не удалось экспортировать CSV звонков." },
  "Reports": { hy: "Հաշվետվություններ", ru: "Отчеты" },
  "Demo call": { hy: "Ցուցադրական զանգ", ru: "Демозвонок" },
  "Grid": { hy: "Աղյուսակ", ru: "Таблица" },
  "Completed calls": { hy: "Ավարտված զանգեր", ru: "Завершенные звонки" },
  "Failed calls": { hy: "Ձախողված զանգեր", ru: "Звонки с ошибкой" },
  "In-progress calls": { hy: "Ընթացիկ զանգեր", ru: "Звонки в обработке" },
  "Positive sentiment calls": { hy: "Դրական տրամադրությամբ զանգեր", ru: "Звонки с позитивной тональностью" },
  "Neutral sentiment calls": { hy: "Չեզոք տրամադրությամբ զանգեր", ru: "Звонки с нейтральной тональностью" },
  "Negative sentiment calls": { hy: "Բացասական տրամադրությամբ զանգեր", ru: "Звонки с негативной тональностью" },
  "Average satisfaction": { hy: "Միջին գոհունակություն", ru: "Средняя удовлетворенность" },
  "Average friendliness": { hy: "Միջին բարյացակամություն", ru: "Среднее дружелюбие" },
  "Customer Satisfaction": { hy: "Հաճախորդի գոհունակություն", ru: "Удовлетворенность клиента" },
  "Agent Friendliness": { hy: "Օպերատորի բարյացակամություն", ru: "Дружелюбие оператора" },
  "Dominant emotion": { hy: "Գերիշխող հույզ", ru: "Преобладающая эмоция" },
  "Frames analyzed": { hy: "Վերլուծված կադրեր", ru: "Проанализировано кадров" },
  "Face frames": { hy: "Դեմքով կադրեր", ru: "Кадры с лицом" },
  "Face presence": { hy: "Դեմքի առկայություն", ru: "Наличие лица" },
  "Average score": { hy: "Միջին գնահատական", ru: "Средняя оценка" },
  "Authorization successful for {{company}}.": { hy: "{{company}} ընկերության նույնականացումը հաջողվեց։", ru: "Авторизация для {{company}} выполнена." },
  "Authorization successful.": { hy: "Նույնականացումը հաջողվեց։", ru: "Авторизация выполнена." },
  "Authorization successful for {{company}}. Loading dashboard...": { hy: "{{company}} ընկերության նույնականացումը հաջողվեց։ Վահանակը բեռնվում է...", ru: "Авторизация для {{company}} выполнена. Загрузка панели..." },
  "Authorization successful. Loading dashboard...": { hy: "Նույնականացումը հաջողվեց։ Վահանակը բեռնվում է...", ru: "Авторизация выполнена. Загрузка панели..." },
  "Loaded {{shown}} of {{total}} calls.": { hy: "Բեռնվել է {{shown}} զանգ՝ {{total}}-ից։", ru: "Загружено {{shown}} из {{total}} звонков." },
  "Loaded {{count}} call.": { hy: "Բեռնվել է {{count}} զանգ։", ru: "Загружен {{count}} звонок." },
  "Loaded {{count}} calls.": { hy: "Բեռնվել է {{count}} զանգ։", ru: "Загружено {{count}} звонков." },
  "QA score recalculated: {{score}}.": { hy: "QA գնահատականը վերահաշվարկվել է՝ {{score}}։", ru: "Оценка QA пересчитана: {{score}}." },
  "QA corrections saved. New QA score: {{score}}.": { hy: "QA ուղղումները պահպանվել են։ Նոր գնահատական՝ {{score}}։", ru: "Исправления QA сохранены. Новая оценка QA: {{score}}." },
  "QA corrections saved.": { hy: "QA ուղղումները պահպանվել են։", ru: "Исправления QA сохранены." },
  "Upload accepted. {{call}} is now queued for analysis.": { hy: "Վերբեռնումն ընդունվել է։ {{call}}-ը հերթագրվել է վերլուծության համար։", ru: "Загрузка принята. {{call}} поставлен в очередь на анализ." },
  "Upload accepted. {{count}} calls are now queued for analysis: {{calls}}.": { hy: "Վերբեռնումն ընդունվել է։ {{count}} զանգ հերթագրվել է վերլուծության համար՝ {{calls}}։", ru: "Загрузка принята. Звонков поставлено в очередь на анализ: {{count}}: {{calls}}." },
  "Export questionnaires": { hy: "Արտահանել հարցաշարերը", ru: "Экспортировать анкеты" },
  "Uploading {{current}} of {{total}}: {{file}}": { hy: "Վերբեռնվում է {{current}}-ը {{total}}-ից՝ {{file}}", ru: "Загрузка {{current}} из {{total}}: {{file}}" },
  "Validated local audio at {{rate}} Hz.": { hy: "Տեղային աուդիոն ստուգվել է {{rate}} Հց հաճախականությամբ։", ru: "Локальное аудио проверено: {{rate}} Гц." },
  "Exporting QA questionnaire {{current}} of {{total}}: {{call}}": { hy: "Արտահանվում է QA հարցաշար {{current}}-ը {{total}}-ից՝ {{call}}", ru: "Экспорт анкеты QA {{current}} из {{total}}: {{call}}" },
  "Downloaded {{count}} QA monitoring questionnaire.": { hy: "Ներբեռնվել է QA մոնիթորինգի {{count}} հարցաշար։", ru: "Скачана {{count}} анкета мониторинга QA." },
  "Downloaded {{count}} QA monitoring questionnaires.": { hy: "Ներբեռնվել է QA մոնիթորինգի {{count}} հարցաշար։", ru: "Скачано анкет мониторинга QA: {{count}}." },
  "Downloaded {{file}}.": { hy: "Ներբեռնվել է {{file}}։", ru: "Скачан файл {{file}}." },
  "{{count}} shown": { hy: "Ցուցադրված է {{count}}", ru: "Показано: {{count}}" },
  "{{shown}} shown of {{total}}": { hy: "Ցուցադրված է {{shown}}՝ {{total}}-ից", ru: "Показано {{shown}} из {{total}}" },
  "{{count}} calls used": { hy: "Օգտագործվել է {{count}} զանգ", ru: "Использовано звонков: {{count}}" },
  "Export {{count}} questionnaire": { hy: "Արտահանել {{count}} հարցաշար", ru: "Экспортировать {{count}} анкету" },
  "Export {{count}} questionnaires": { hy: "Արտահանել {{count}} հարցաշար", ru: "Экспортировать анкеты: {{count}}" },
  "Concern {{number}}": { hy: "Մտահոգություն {{number}}", ru: "Проблема {{number}}" },
  "Page {{page}} - {{summary}} - {{size}} per page": { hy: "Էջ {{page}} - {{summary}} - {{size}} մեկ էջում", ru: "Страница {{page}} - {{summary}} - по {{size}} на странице" },
  ". Review it, then upload it to the dashboard.": { hy: "։ Վերանայեք այն, ապա վերբեռնեք վահանակ։", ru: ". Проверьте запись, затем загрузите ее на панель." },
  "file(s) selected": { hy: "ֆայլ ընտրված է", ru: "файл(ов) выбрано" },
  "· created": { hy: "· ստեղծված", ru: "· создано" },
  "· score": { hy: "· գնահատական", ru: "· оценка" },
  "/512 characters": { hy: "/512 նիշ", ru: "/512 символов" },
  "No providers match “": { hy: "Չկան համապատասխան մատակարարներ՝ «", ru: "Нет провайдеров по запросу «" },
  "Invalid email or password.": { hy: "Էլ․ փոստը կամ գաղտնաբառը սխալ է։", ru: "Неверная электронная почта или пароль." },
  "This user account is inactive or does not have permission to sign in.": { hy: "Այս օգտահաշիվն ապաակտիվ է կամ մուտքի թույլտվություն չունի։", ru: "Эта учетная запись неактивна или не имеет разрешения на вход." },
  "The login response did not include an access token.": { hy: "Մուտքի պատասխանը հասանելիության թոքեն չի պարունակում։", ru: "Ответ входа не содержит токен доступа." },
  "The server did not return updated QA applicability data.": { hy: "Սերվերը չի վերադարձրել QA կիրառելիության թարմացված տվյալները։", ru: "Сервер не вернул обновленные данные применимости QA." },
  "Unauthorized": { hy: "Չլիազորված", ru: "Не авторизован" },
  "Unable to restore your session.": { hy: "Չհաջողվեց վերականգնել աշխատաշրջանը։", ru: "Не удалось восстановить сеанс." },
  "Speaker": { hy: "Խոսնակ", ru: "Спикер" },
  "Unnamed agent": { hy: "Անանուն օպերատոր", ru: "Оператор без имени" },
  "Confirmation must match the new password.": { hy: "Հաստատումը պետք է համապատասխանի նոր գաղտնաբառին։", ru: "Подтверждение должно совпадать с новым паролем." },
  "New password must contain at least 8 characters.": { hy: "Նոր գաղտնաբառը պետք է պարունակի առնվազն 8 նիշ։", ru: "Новый пароль должен содержать не менее 8 символов." },
  "New password must differ from the current password.": { hy: "Նոր գաղտնաբառը պետք է տարբերվի ընթացիկից։", ru: "Новый пароль должен отличаться от текущего." },
  "Password changed successfully": { hy: "Գաղտնաբառը հաջողությամբ փոխվեց", ru: "Пароль успешно изменен" },
  "Administrator access is required to recalculate QA scores.": { hy: "QA գնահատականները վերահաշվարկելու համար անհրաժեշտ է ադմինիստրատորի հասանելիություն։", ru: "Для перерасчета оценок QA необходим доступ администратора." },
  "Audio recording is not supported in this browser.": { hy: "Այս դիտարկիչը չի աջակցում աուդիո ձայնագրությանը։", ru: "Этот браузер не поддерживает запись аудио." },
  "Authorization required.": { hy: "Անհրաժեշտ է նույնականացում։", ru: "Требуется авторизация." },
  "Authorize with a company ID and API token before loading calls.": { hy: "Զանգերը բեռնելուց առաջ նույնականացեք ընկերության ID-ով և API թոքենով։", ru: "Перед загрузкой звонков авторизуйтесь с ID компании и API-токеном." },
  "Checking authorization...": { hy: "Նույնականացումը ստուգվում է...", ru: "Проверка авторизации..." },
  "Exporting calls CSV with current filters...": { hy: "Զանգերի CSV-ն արտահանվում է ընթացիկ զտիչներով...", ru: "Экспорт CSV звонков с текущими фильтрами..." },
  "Provide either a presigned URL or one or more local media files.": { hy: "Տրամադրեք նախաստորագրված URL կամ մեկ կամ ավելի տեղային մեդիա ֆայլ։", ru: "Укажите подписанный URL или один либо несколько локальных медиафайлов." },
  "QA profile saved successfully.": { hy: "QA պրոֆիլը հաջողությամբ պահպանվեց։", ru: "Профиль QA успешно сохранен." },
  "QA scoring settings saved successfully.": { hy: "QA գնահատման կարգավորումները հաջողությամբ պահպանվեցին։", ru: "Настройки оценки QA успешно сохранены." },
  "Record audio first before uploading.": { hy: "Վերբեռնելուց առաջ ձայնագրեք աուդիոն։", ru: "Перед загрузкой сначала запишите аудио." },
  "Select at least one completed conversation to export the QA questionnaire.": { hy: "QA հարցաշարն արտահանելու համար ընտրեք առնվազն մեկ ավարտված զրույց։", ru: "Выберите хотя бы один завершенный разговор для экспорта анкеты QA." },
  "Unable to copy text to clipboard.": { hy: "Չհաջողվեց պատճենել տեքստը։", ru: "Не удалось скопировать текст в буфер обмена." },
  "Uploading call and queuing analysis...": { hy: "Զանգը վերբեռնվում է, վերլուծությունը հերթագրվում է...", ru: "Загрузка звонка и постановка анализа в очередь..." },
  "Use either a presigned URL or local media files in a single upload.": { hy: "Մեկ վերբեռնման մեջ օգտագործեք կամ նախաստորագրված URL, կամ տեղային մեդիա ֆայլեր։", ru: "В одной загрузке используйте либо подписанный URL, либо локальные медиафайлы." },
  "You have been logged out.": { hy: "Դուք դուրս եք եկել համակարգից։", ru: "Вы вышли из системы." },
  "Your session expired. Please sign in again.": { hy: "Ձեր աշխատաշրջանն ավարտվել է։ Կրկին մուտք գործեք։", ru: "Срок сеанса истек. Войдите снова." },
  "Choose both UTC date and time values.": { hy: "Ընտրեք և՛ UTC ամսաթիվը, և՛ ժամը։", ru: "Укажите дату и время UTC." },
  "The start of the range must be before the end.": { hy: "Ժամանակահատվածի սկիզբը պետք է լինի ավարտից առաջ։", ru: "Начало диапазона должно предшествовать окончанию." },
  "Sending session for analysis...": { hy: "Աշխատաշրջանն ուղարկվում է վերլուծության...", ru: "Сеанс отправляется на анализ..." },
  "Session sent for analysis.": { hy: "Աշխատաշրջանն ուղարկվել է վերլուծության։", ru: "Сеанс отправлен на анализ." },
  "Change at least one question before saving.": { hy: "Պահպանելուց առաջ փոխեք առնվազն մեկ հարց։", ru: "Перед сохранением измените хотя бы один вопрос." },
  "Conversation not found.": { hy: "Զրույցը չի գտնվել։", ru: "Разговор не найден." },
  "Enter an overall correction reason before saving.": { hy: "Պահպանելուց առաջ նշեք ուղղման ընդհանուր պատճառը։", ru: "Перед сохранением укажите общую причину исправления." },
  "QA corrections saved successfully.": { hy: "QA ուղղումները հաջողությամբ պահպանվեցին։", ru: "Исправления QA успешно сохранены." },
  "You are not authorized to edit this QA questionnaire.": { hy: "Դուք լիազորված չեք խմբագրել այս QA հարցաշարը։", ru: "У вас нет прав на редактирование этой анкеты QA." },
  "Name and email are required.": { hy: "Անունը և էլ․ փոստը պարտադիր են։", ru: "Имя и электронная почта обязательны." },
  "Password must contain at least 8 characters.": { hy: "Գաղտնաբառը պետք է պարունակի առնվազն 8 նիշ։", ru: "Пароль должен содержать не менее 8 символов." },
  "Password reset successfully.": { hy: "Գաղտնաբառը հաջողությամբ վերակայվեց։", ru: "Пароль успешно сброшен." },
  "Unable to load users.": { hy: "Չհաջողվեց բեռնել օգտատերերին։", ru: "Не удалось загрузить пользователей." },
  "Unable to reset password.": { hy: "Չհաջողվեց վերակայել գաղտնաբառը։", ru: "Не удалось сбросить пароль." },
  "Unable to save user.": { hy: "Չհաջողվեց պահպանել օգտատիրոջը։", ru: "Не удалось сохранить пользователя." },
  "Unable to update user status.": { hy: "Չհաջողվեց թարմացնել օգտատիրոջ կարգավիճակը։", ru: "Не удалось обновить статус пользователя." },
  "You cannot remove your own Admin role.": { hy: "Դուք չեք կարող հեռացնել ձեր սեփական ադմինիստրատորի դերը։", ru: "Нельзя снять собственную роль администратора." },
  "Another administrator changed this connector. Reload the latest configuration before saving again.": { hy: "Մեկ այլ ադմինիստրատոր փոխել է այս միակցիչը։ Կրկին պահպանելուց առաջ բեռնեք վերջին կարգավորումը։", ru: "Другой администратор изменил это подключение. Перед повторным сохранением загрузите последнюю конфигурацию." },
  "Connector configuration saved.": { hy: "Միակցիչի կարգավորումը պահպանվեց։", ru: "Конфигурация подключения сохранена." },
  "Workflow automation deleted.": { hy: "Աշխատանքային հոսքի ավտոմատացումը ջնջվեց։", ru: "Автоматизация процесса удалена." },
  "Activation is locked until the adapter is installed.": { hy: "Ակտիվացումն արգելափակված է մինչև ադապտերի տեղադրումը։", ru: "Активация заблокирована до установки адаптера." },
  "Actor": { hy: "Կատարող", ru: "Инициатор" },
  "Allow this connector to handle new calls.": { hy: "Թույլատրել այս միակցիչին մշակել նոր զանգերը։", ru: "Разрешить этому подключению обрабатывать новые звонки." },
  "Changed fields": { hy: "Փոփոխված դաշտեր", ru: "Измененные поля" },
  "Clear stored credential": { hy: "Մաքրել պահպանված մուտքային տվյալը", ru: "Удалить сохраненные учетные данные" },
  "Configure and monitor the voice providers available to your workspace.": { hy: "Կարգավորեք և վերահսկեք աշխատանքային տարածքում հասանելի ձայնային մատակարարները։", ru: "Настраивайте и контролируйте голосовых провайдеров рабочего пространства." },
  "Configure this voice provider for your workspace.": { hy: "Կարգավորեք այս ձայնային մատակարարն աշխատանքային տարածքի համար։", ru: "Настройте этого голосового провайдера для рабочего пространства." },
  "Configured — leave blank to keep": { hy: "Կարգավորված է — թողեք դատարկ՝ պահպանելու համար", ru: "Настроено — оставьте пустым, чтобы сохранить" },
  "Connector settings": { hy: "Միակցիչի կարգավորումներ", ru: "Настройки подключения" },
  "Credentials are encrypted and write-only. Stored values are never displayed.": { hy: "Մուտքային տվյալները գաղտնագրված են և միայն գրառման համար։ Պահպանված արժեքները չեն ցուցադրվում։", ru: "Учетные данные зашифрованы и доступны только для записи. Сохраненные значения никогда не отображаются." },
  "Do not rotate credentials while calls are active. Existing calls may be interrupted.": { hy: "Մի փոխեք մուտքային տվյալները ակտիվ զանգերի ժամանակ։ Ընթացիկ զանգերը կարող են ընդհատվել։", ru: "Не меняйте учетные данные во время активных звонков. Текущие звонки могут прерваться." },
  "Name and activation state for this account.": { hy: "Այս հաշվի անունն ու ակտիվացման վիճակը։", ru: "Имя и состояние активации этой учетной записи." },
  "Name shown to administrators when managing this connector.": { hy: "Միակցիչը կառավարելիս ադմինիստրատորներին ցուցադրվող անունը։", ru: "Имя, отображаемое администраторам при управлении подключением." },
  "No audit events yet.": { hy: "Աուդիտի իրադարձություններ դեռ չկան։", ru: "Событий аудита пока нет." },
  "Not saved yet": { hy: "Դեռ պահպանված չէ", ru: "Еще не сохранено" },
  "Production adapter required": { hy: "Պահանջվում է production ադապտեր", ru: "Требуется рабочий адаптер" },
  "Provider limitation": { hy: "Մատակարարի սահմանափակում", ru: "Ограничение провайдера" },
  "Provider-specific behavior and endpoints.": { hy: "Մատակարարին հատուկ վարքագիծ և վերջնակետեր։", ru: "Поведение и конечные точки конкретного провайдера." },
  "Reload latest configuration": { hy: "Վերբեռնել վերջին կարգավորումը", ru: "Загрузить последнюю конфигурацию" },
  "Retry": { hy: "Կրկին փորձել", ru: "Повторить" },
  "Save the configuration as disabled. The production adapter must be installed before activation.": { hy: "Պահպանեք կարգավորումն անջատված վիճակում։ Ակտիվացումից առաջ պետք է տեղադրել production ադապտերը։", ru: "Сохраните конфигурацию отключенной. Перед активацией необходимо установить рабочий адаптер." },
  "System": { hy: "Համակարգ", ru: "Система" },
  "The 25 most recent administrative events.": { hy: "Վերջին 25 վարչական իրադարձությունները։", ru: "25 последних административных событий." },
  "The backend catalog did not return any providers.": { hy: "Սերվերի կատալոգը մատակարարներ չի վերադարձրել։", ru: "Каталог сервера не вернул провайдеров." },
  "This provider cannot be activated in this environment.": { hy: "Այս միջավայրում մատակարարը չի կարող ակտիվացվել։", ru: "Этого провайдера нельзя активировать в данной среде." },
  "This provider has no configuration fields.": { hy: "Այս մատակարարը կարգավորման դաշտեր չունի։", ru: "У этого провайдера нет полей конфигурации." },
  "Trace ID": { hy: "Հետագծման ID", ru: "ID трассировки" },
  "Write-only": { hy: "Միայն գրառում", ru: "Только запись" },
  "API HTTP": { hy: "API HTTP", ru: "API HTTP" },
  "Additional lead fields": { hy: "Լիդի լրացուցիչ դաշտեր", ru: "Дополнительные поля лида" },
  "Advanced additional fields": { hy: "Ընդլայնված լրացուցիչ դաշտեր", ru: "Расширенные дополнительные поля" },
  "Assigned user ID": { hy: "Կցված օգտատիրոջ ID", ru: "ID назначенного пользователя" },
  "Assignee account ID": { hy: "Պատասխանատուի հաշվի ID", ru: "ID учетной записи исполнителя" },
  "Attempts": { hy: "Փորձեր", ru: "Попытки" },
  "Bitrix24 lead": { hy: "Bitrix24 լիդ", ru: "Лид Bitrix24" },
  "Choose a platform, configure its fields, and control which analyses are delivered.": { hy: "Ընտրեք հարթակ, կարգավորեք դաշտերը և որոշեք ուղարկվող վերլուծությունները։", ru: "Выберите платформу, настройте поля и укажите, какие результаты анализа доставлять." },
  "Configured. Enter email and token only to replace credentials.": { hy: "Կարգավորված է։ Մուտքային տվյալները փոխելու համար մուտքագրեք միայն էլ․ փոստն ու թոքենը։", ru: "Настроено. Введите почту и токен только для замены учетных данных." },
  "Create a workflow to deliver completed analyses to a webhook, Jira project, or Bitrix24 CRM.": { hy: "Ստեղծեք հոսք՝ ավարտված վերլուծությունները webhook, Jira նախագիծ կամ Bitrix24 CRM ուղարկելու համար։", ru: "Создайте процесс для доставки завершенного анализа в webhook, проект Jira или CRM Bitrix24." },
  "Credential-bearing URL hidden": { hy: "Մուտքային տվյալներ պարունակող URL-ը թաքցված է", ru: "URL с учетными данными скрыт" },
  "Custom summary": { hy: "Հատուկ ամփոփում", ru: "Пользовательская сводка" },
  "Default": { hy: "Լռելյայն", ru: "По умолчанию" },
  "Delivered": { hy: "Առաքված", ru: "Доставлено" },
  "Delivery history": { hy: "Առաքման պատմություն", ru: "История доставки" },
  "Disabled destinations are saved but do not deliver events.": { hy: "Անջատված նպատակակետերը պահպանվում են, բայց իրադարձություններ չեն ուղարկում։", ru: "Отключенные назначения сохраняются, но не доставляют события." },
  "Event": { hy: "Իրադարձություն", ru: "Событие" },
  "Event type": { hy: "Իրադարձության տեսակ", ru: "Тип события" },
  "Fetching configured workflow destinations.": { hy: "Բեռնվում են կարգավորված հոսքերի նպատակակետերը։", ru: "Загружаются настроенные назначения процессов." },
  "Fetching recent delivery attempts.": { hy: "Բեռնվում են առաքման վերջին փորձերը։", ru: "Загружаются последние попытки доставки." },
  "Field name": { hy: "Դաշտի անուն", ru: "Имя поля" },
  "Field value": { hy: "Դաշտի արժեք", ru: "Значение поля" },
  "Hide URL": { hy: "Թաքցնել URL-ը", ru: "Скрыть URL" },
  "Include analysis summary in comments": { hy: "Վերլուծության ամփոփումը ներառել մեկնաբանություններում", ru: "Включить сводку анализа в комментарии" },
  "Include analysis summary in description": { hy: "Վերլուծության ամփոփումը ներառել նկարագրությունում", ru: "Включить сводку анализа в описание" },
  "Include transcript in description": { hy: "Տրանսկրիպցիան ներառել նկարագրությունում", ru: "Включить расшифровку в описание" },
  "Integration HTTP": { hy: "Ինտեգրման HTTP", ru: "HTTP интеграции" },
  "Issue type": { hy: "Խնդրի տեսակ", ru: "Тип задачи" },
  "Jira API token": { hy: "Jira API թոքեն", ru: "API-токен Jira" },
  "Jira account email": { hy: "Jira հաշվի էլ․ փոստ", ru: "Почта учетной записи Jira" },
  "Jira issue": { hy: "Jira խնդիր", ru: "Задача Jira" },
  "Jira site URL": { hy: "Jira կայքի URL", ru: "URL сайта Jira" },
  "Labels": { hy: "Պիտակներ", ru: "Метки" },
  "Lead title": { hy: "Լիդի վերնագիր", ru: "Название лида" },
  "Leave conversation ID empty to use the latest completed call.": { hy: "Զրույցի ID-ն թողեք դատարկ՝ վերջին ավարտված զանգն օգտագործելու համար։", ru: "Оставьте ID разговора пустым, чтобы использовать последний завершенный звонок." },
  "No response body returned.": { hy: "Պատասխանի բովանդակություն չի վերադարձվել։", ru: "Тело ответа не получено." },
  "Opened": { hy: "Բացված", ru: "Открыт" },
  "Optional": { hy: "Ընտրովի", ru: "Необязательно" },
  "Optional account ID": { hy: "Հաշվի ընտրովի ID", ru: "Необязательный ID учетной записи" },
  "Optional; generated from the analysis by default": { hy: "Ընտրովի․ լռելյայն ստեղծվում է վերլուծությունից", ru: "Необязательно; по умолчанию создается из анализа" },
  "Payload options": { hy: "Բեռնվածքի ընտրանքներ", ru: "Параметры полезной нагрузки" },
  "Platform": { hy: "Հարթակ", ru: "Платформа" },
  "Priority name": { hy: "Առաջնահերթության անուն", ru: "Название приоритета" },
  "Project key": { hy: "Նախագծի բանալի", ru: "Ключ проекта" },
  "QA applicable": { hy: "QA կիրառելի", ru: "QA применим" },
  "Required": { hy: "Պարտադիր", ru: "Обязательно" },
  "Response": { hy: "Պատասխան", ru: "Ответ" },
  "Reveal URL": { hy: "Ցուցադրել URL-ը", ru: "Показать URL" },
  "Send completed call analyses to Webhook, Jira, and Bitrix24 destinations.": { hy: "Ավարտված զանգերի վերլուծություններն ուղարկեք Webhook, Jira և Bitrix24 նպատակակետեր։", ru: "Отправляйте анализ завершенных звонков в Webhook, Jira и Bitrix24." },
  "Send unhappy calls to Zapier": { hy: "Դժգոհ զանգերն ուղարկել Zapier", ru: "Отправлять звонки недовольных клиентов в Zapier" },
  "Sentiments": { hy: "Տրամադրություններ", ru: "Тональности" },
  "Separate department tags with commas.": { hy: "Բաժինների պիտակներն առանձնացրեք ստորակետերով։", ru: "Разделяйте метки отделов запятыми." },
  "Separate labels with commas.": { hy: "Պիտակներն առանձնացրեք ստորակետերով։", ru: "Разделяйте метки запятыми." },
  "Source ID": { hy: "Աղբյուրի ID", ru: "ID источника" },
  "Status ID": { hy: "Կարգավիճակի ID", ru: "ID статуса" },
  "Success": { hy: "Հաջողություն", ru: "Успешно" },
  "Support, Billing, Sales": { hy: "Աջակցություն, վճարումներ, վաճառք", ru: "Поддержка, оплата, продажи" },
  "Task": { hy: "Առաջադրանք", ru: "Задача" },
  "Test Integration": { hy: "Ստուգել ինտեգրումը", ru: "Проверить интеграцию" },
  "This workflow has not recorded delivery attempts.": { hy: "Այս հոսքի համար առաքման փորձեր չեն գրանցվել։", ru: "Для этого процесса попытки доставки не зарегистрированы." },
  "Untitled workflow": { hy: "Անանուն աշխատանքային հոսք", ru: "Процесс без названия" },
  "Webhook URL": { hy: "Webhook URL", ru: "URL вебхука" },
  "Choose a wider UTC date range and try again.": { hy: "Ընտրեք ավելի լայն UTC ժամանակահատված և կրկին փորձեք։", ru: "Выберите более широкий диапазон UTC и повторите попытку." },
  "No agent data is available for this range.": { hy: "Այս ժամանակահատվածի համար օպերատորների տվյալներ չկան։", ru: "Для этого диапазона нет данных операторов." },
  "No failed questions": { hy: "Չանցած հարցեր չկան", ru: "Нет непройденных вопросов" },
  "No weakest question": { hy: "Ամենաթույլ հարց չկա", ru: "Нет самого слабого вопроса" },
  "Not-passed questions": { hy: "Չանցած հարցեր", ru: "Непройденные вопросы" },
  "Pass / fail": { hy: "Անցած / չանցած", ru: "Пройдено / не пройдено" },
  "Share of calls with a recognized sentiment.": { hy: "Ճանաչված տրամադրությամբ զանգերի բաժինը։", ru: "Доля звонков с распознанной тональностью." },
  "Unable to load report": { hy: "Չհաջողվեց բեռնել հաշվետվությունը", ru: "Не удалось загрузить отчет" },
  "Debug": { hy: "Կարգաբերում", ru: "Отладка" },
  "Decoding": { hy: "Վերծանում", ru: "Декодирование" },
  "Default Agent input": { hy: "Օպերատորի լռելյայն մուտք", ru: "Стандартный вход оператора" },
  "Default Customer input": { hy: "Հաճախորդի լռելյայն մուտք", ru: "Стандартный вход клиента" },
  "FACE ATTRIBUTES": { hy: "ԴԵՄՔԻ ՀԱՏԿԱՆԻՇՆԵՐ", ru: "ХАРАКТЕРИСТИКИ ЛИЦА" },
  "LOCAL FACE ANALYSIS": { hy: "ԴԵՄՔԻ ՏԵՂԱՅԻՆ ՎԵՐԼՈՒԾՈՒԹՅՈՒՆ", ru: "ЛОКАЛЬНЫЙ АНАЛИЗ ЛИЦА" },
  "Last": { hy: "Վերջին", ru: "Последнее" },
  "Listening": { hy: "Լսում", ru: "Прослушивание" },
  "Listening...": { hy: "Լսում...", ru: "Прослушивание..." },
  "No conversation yet": { hy: "Զրույց դեռ չկա", ru: "Разговора пока нет" },
  "No tips returned yet.": { hy: "Խորհուրդներ դեռ չեն վերադարձվել։", ru: "Советов пока нет." },
  "No tips yet": { hy: "Խորհուրդներ դեռ չկան", ru: "Советов пока нет" },
  "Real Time Conversation": { hy: "Զրույց իրական ժամանակում", ru: "Разговор в реальном времени" },
  "Role confidence": { hy: "Դերի վստահություն", ru: "Уверенность в роли" },
  "Sending...": { hy: "Ուղարկվում է...", ru: "Отправка..." },
  "Unknown time": { hy: "Անհայտ ժամ", ru: "Неизвестное время" },
  "Unknown topic": { hy: "Անհայտ թեմա", ru: "Неизвестная тема" },
  "Updated:": { hy: "Թարմացված՝", ru: "Обновлено:" },
  "Waiting for tips...": { hy: "Սպասում է խորհուրդների...", ru: "Ожидание советов..." },
  "0 — Failed": { hy: "0 — Չանցած", ru: "0 — Не пройдено" },
  "1 — Passed": { hy: "1 — Անցած", ru: "1 — Пройдено" },
  "No explanation provided.": { hy: "Բացատրություն չի տրվել։", ru: "Объяснение не указано." },
  "No improvement items listed.": { hy: "Բարելավման կետեր նշված չեն։", ru: "Пункты для улучшения не указаны." },
  "No strengths listed.": { hy: "Ուժեղ կողմեր նշված չեն։", ru: "Сильные стороны не указаны." },
  "Passed-question weight": { hy: "Անցած հարցերի կշիռ", ru: "Вес пройденных вопросов" },
  "QA is not available for this completed call yet. You can trigger recalculation any time.": { hy: "Այս ավարտված զանգի QA-ն դեռ հասանելի չէ։ Կարող եք ցանկացած պահի վերահաշվարկ սկսել։", ru: "QA для этого завершенного звонка пока недоступен. Перерасчет можно запустить в любое время." },
  "QA scoring is not available for this call.": { hy: "Այս զանգի համար QA գնահատումը հասանելի չէ։", ru: "Оценка QA для этого звонка недоступна." },
  "Review automatic QA scoring, resolution status, and question-by-question evaluation.": { hy: "Վերանայեք ավտոմատ QA գնահատումը, լուծման կարգավիճակը և հարց առ հարց արդյունքները։", ru: "Проверьте автоматическую оценку QA, статус решения и результаты по каждому вопросу." },
  "Run QA scoring or wait for the backend to finish evaluating this call.": { hy: "Գործարկեք QA գնահատումը կամ սպասեք, մինչև սերվերն ավարտի այս զանգի գնահատումը։", ru: "Запустите оценку QA или дождитесь завершения оценки звонка на сервере." },
  "This call is not eligible for QA scoring.": { hy: "Այս զանգը ենթակա չէ QA գնահատման։", ru: "Этот звонок не подлежит оценке QA." },
  "Total penalty weight": { hy: "Տուգանային ընդհանուր կշիռ", ru: "Общий штрафной вес" },
  "Why is this questionnaire being corrected?": { hy: "Ինչո՞ւ է այս հարցաշարը ուղղվում։", ru: "Почему эта анкета исправляется?" },
  "Calls shorter than this duration will be marked as QA not applicable.": { hy: "Այս տևողությունից կարճ զանգերը կնշվեն որպես QA-ի համար ոչ կիրառելի։", ru: "Звонки короче указанной длительности будут отмечены как неприменимые для QA." },
  "Configure the business rules and weighted questions used to score company conversations.": { hy: "Կարգավորեք ընկերության զրույցները գնահատելու բիզնես կանոններն ու կշռված հարցերը։", ru: "Настройте бизнес-правила и взвешенные вопросы для оценки разговоров компании." },
  "Customer satisfaction, Compliance": { hy: "Հաճախորդի գոհունակություն, համապատասխանություն", ru: "Удовлетворенность клиента, соответствие" },
  "Enable second-call detection": { hy: "Միացնել կրկնակի զանգերի հայտնաբերումը", ru: "Включить определение повторных звонков" },
  "Existing calls keep their current QA score until recalculated.": { hy: "Գոյություն ունեցող զանգերը պահպանում են իրենց QA գնահատականը մինչև վերահաշվարկը։", ru: "Существующие звонки сохраняют текущую оценку QA до перерасчета." },
  "Fetching your company QA tuning profile.": { hy: "Բեռնվում է ընկերության QA կարգավորման պրոֆիլը։", ru: "Загружается профиль настройки QA компании." },
  "Loading QA profile": { hy: "QA պրոֆիլը բեռնվում է", ru: "Загрузка профиля QA" },
  "Loading QA scoring settings...": { hy: "QA գնահատման կարգավորումները բեռնվում են...", ru: "Загрузка настроек оценки QA..." },
  "Question weights are failure penalties and are subtracted from the maximum score.": { hy: "Հարցերի կշիռները ձախողման տուգանքներ են և հանվում են առավելագույն գնահատականից։", ru: "Вес вопросов является штрафом за ошибки и вычитается из максимальной оценки." },
  "Score = maximum QA score − failed-question weights.": { hy: "Գնահատական = QA առավելագույն գնահատական − չանցած հարցերի կշիռներ։", ru: "Оценка = максимальная оценка QA − вес непройденных вопросов." },
  "Score = passed weight ÷ total enabled weight × maximum QA score.": { hy: "Գնահատական = անցած կշիռ ÷ միացված ընդհանուր կշիռ × QA առավելագույն գնահատական։", ru: "Оценка = пройденный вес ÷ общий включенный вес × максимальная оценка QA." },
  "Scoring method": { hy: "Գնահատման եղանակ", ru: "Метод оценки" },
  "Sets the maximum score used for company QA evaluations.": { hy: "Սահմանում է ընկերության QA գնահատումների առավելագույն միավորը։", ru: "Задает максимальную оценку для QA компании." },
  "Subtract failed-question weights": { hy: "Հանել չանցած հարցերի կշիռները", ru: "Вычитать вес непройденных вопросов" },
  "We could not load the current QA profile.": { hy: "Չհաջողվեց բեռնել ընթացիկ QA պրոֆիլը։", ru: "Не удалось загрузить текущий профиль QA." },
  "When enabled, repeat or follow-up calls can automatically pass repeat-sensitive QA checks such as customer name, source, need discovery, preferences, appointment CTA, and WhatsApp follow-up.": { hy: "Միացնելու դեպքում կրկնակի կամ հետադարձ զանգերը կարող են ավտոմատ անցնել կրկնությանը զգայուն QA ստուգումները՝ հաճախորդի անուն, աղբյուր, կարիքների բացահայտում, նախապատվություններ, հանդիպման կոչ և WhatsApp հետադարձ կապ։", ru: "Если включено, повторные звонки могут автоматически проходить зависящие от повторения проверки QA: имя клиента, источник, выявление потребностей, предпочтения, призыв назначить встречу и связь через WhatsApp." },
  "Greeting and introduction": { hy: "Ողջույն և ներկայացում", ru: "Приветствие и представление" },
  "The agent opened the call professionally.": { hy: "Օպերատորը պրոֆեսիոնալ կերպով սկսեց զանգը։", ru: "Оператор профессионально начал разговор." },
  "Admins have unrestricted access to all agents.": { hy: "Ադմինիստրատորներն ունեն անսահմանափակ հասանելիություն բոլոր օպերատորներին։", ru: "Администраторы имеют неограниченный доступ ко всем операторам." },
  "Create the first user for this company.": { hy: "Ստեղծեք այս ընկերության առաջին օգտատիրոջը։", ru: "Создайте первого пользователя этой компании." },
  "No assigned agents means this user cannot see call data.": { hy: "Եթե օպերատորներ կցված չեն, օգտատերը չի տեսնի զանգերի տվյալները։", ru: "Без назначенных операторов пользователь не видит данные звонков." },
  "Users with no assigned agents cannot see any call data. Admin users automatically have unrestricted access.": { hy: "Առանց կցված օպերատորների օգտատերերը չեն տեսնում զանգերի տվյալները։ Ադմինիստրատորներն ավտոմատ ունեն անսահմանափակ հասանելիություն։", ru: "Пользователи без назначенных операторов не видят данные звонков. Администраторы автоматически получают неограниченный доступ." },
  "A separate random conversation ID will be generated for each local file during upload.": { hy: "Յուրաքանչյուր տեղային ֆայլի վերբեռնման ժամանակ կստեղծվի առանձին պատահական զրույցի ID։", ru: "Для каждого локального файла при загрузке будет создан отдельный случайный ID разговора." },
  "Add a rule to watch transcripts for important words or phrases.": { hy: "Ավելացրեք կանոն՝ տրանսկրիպցիաներում կարևոր բառերին կամ արտահայտություններին հետևելու համար։", ru: "Добавьте правило для отслеживания важных слов или фраз в расшифровках." },
  "Administrator access is required to manage users.": { hy: "Օգտատերերին կառավարելու համար անհրաժեշտ է ադմինիստրատորի հասանելիություն։", ru: "Для управления пользователями необходим доступ администратора." },
  "Administrator access is required to manage voice connectors.": { hy: "Ձայնային միակցիչները կառավարելու համար անհրաժեշտ է ադմինիստրատորի հասանելիություն։", ru: "Для управления голосовыми подключениями необходим доступ администратора." },
  "Audio and MOV files are supported. Client-side sample-rate validation is temporarily disabled for local uploads. Presigned URLs are still queued as-is because the browser cannot inspect remote files before upload.": { hy: "Աջակցվում են աուդիո և MOV ֆայլեր։ Տեղային վերբեռնումների համար հաճախականության ստուգումը դիտարկիչում ժամանակավորապես անջատված է։ Նախաստորագրված URL-ները հերթագրվում են անփոփոխ, քանի որ դիտարկիչը չի կարող նախապես ստուգել հեռակա ֆայլերը։", ru: "Поддерживаются аудио- и MOV-файлы. Проверка частоты дискретизации в браузере для локальных загрузок временно отключена. Подписанные URL ставятся в очередь без изменений, поскольку браузер не может проверить удаленные файлы до загрузки." },
  "Choose which metrics appear in the built-in dashboard graphic. Changes are saved in this browser.": { hy: "Ընտրեք ներկառուցված վահանակի գրաֆիկում ցուցադրվող չափանիշները։ Փոփոխությունները պահպանվում են այս դիտարկիչում։", ru: "Выберите показатели для встроенного графика панели. Изменения сохраняются в этом браузере." },
  "Configure transcript keywords that should trigger alerts and recommended actions. These rules are saved only in this browser for now.": { hy: "Կարգավորեք տրանսկրիպցիայի բանալի բառերը, որոնք պետք է ազդանշաններ և առաջարկվող գործողություններ գործարկեն։ Առայժմ կանոնները պահպանվում են միայն այս դիտարկիչում։", ru: "Настройте ключевые слова расшифровки, которые вызывают оповещения и рекомендуемые действия. Пока правила сохраняются только в этом браузере." },
  "Conversation playback position": { hy: "Զրույցի նվագարկման դիրք", ru: "Позиция воспроизведения разговора" },
  "Conversation summarization": { hy: "Զրույցի ամփոփում", ru: "Резюме разговора" },
  "Emotional signals timeline separated by speaker": { hy: "Հուզական ազդակների ժամանակագիծ՝ ըստ խոսնակի", ru: "Хронология эмоциональных сигналов по спикерам" },
  "Filter your company calls, then open one to inspect the full analysis.": { hy: "Զտեք ընկերության զանգերը, ապա բացեք մեկը՝ ամբողջական վերլուծությունը դիտելու համար։", ru: "Отфильтруйте звонки компании, затем откройте один для просмотра полного анализа." },
  "Fraud escalation": { hy: "Խարդախության էսկալացիա", ru: "Эскалация мошенничества" },
  "N/A": { hy: "Կ/Չ", ru: "Н/Д" },
  "No keyword rules yet. Add them from the dashboard to trigger transcript alerts.": { hy: "Բանալի բառերի կանոններ դեռ չկան։ Ավելացրեք դրանք վահանակից՝ տրանսկրիպցիայի ազդանշաններ ստանալու համար։", ru: "Правил ключевых слов пока нет. Добавьте их на панели, чтобы получать оповещения по расшифровке." },
  "Notify fraud operations and review the call immediately.": { hy: "Տեղեկացրեք խարդախության բաժնին և անմիջապես վերանայեք զանգը։", ru: "Уведомите подразделение по борьбе с мошенничеством и немедленно проверьте звонок." },
  "Only completed calls can be exported as QA monitoring questionnaires.": { hy: "Որպես QA մոնիթորինգի հարցաշար կարող են արտահանվել միայն ավարտված զանգերը։", ru: "В виде анкет мониторинга QA можно экспортировать только завершенные звонки." },
  "Pause conversation": { hy: "Դադարեցնել զրույցը", ru: "Приостановить разговор" },
  "Playback options": { hy: "Նվագարկման ընտրանքներ", ru: "Параметры воспроизведения" },
  "Save your connection settings, then load or upload a call.": { hy: "Պահպանեք կապի կարգավորումները, ապա բեռնեք կամ վերբեռնեք զանգ։", ru: "Сохраните настройки подключения, затем загрузите список или новый звонок." },
  "Select completed conversations that already have transcript and analysis data, then download the generated questionnaire files.": { hy: "Ընտրեք տրանսկրիպցիա և վերլուծության տվյալներ ունեցող ավարտված զրույցները, ապա ներբեռնեք ստեղծված հարցաշարերը։", ru: "Выберите завершенные разговоры с расшифровкой и анализом, затем скачайте созданные файлы анкет." },
  "Sign in with your company user account, or use a partner API token.": { hy: "Մուտք գործեք ընկերության օգտահաշվով կամ օգտագործեք գործընկերոջ API թոքենը։", ru: "Войдите с учетной записью компании или используйте партнерский API-токен." },
  "Try refreshing the list or selecting a different conversation.": { hy: "Փորձեք թարմացնել ցանկը կամ ընտրել այլ զրույց։", ru: "Попробуйте обновить список или выбрать другой разговор." },
  "Upload audio, monitor processing, and inspect transcripts, diarization, sentiment, and satisfaction scores from your backend.": { hy: "Վերբեռնեք աուդիո, հետևեք մշակմանը և դիտեք տրանսկրիպցիաները, խոսնակների տարբերակումը, տրամադրությունն ու գոհունակության գնահատականները։", ru: "Загружайте аудио, следите за обработкой и изучайте расшифровки, диаризацию, тональность и оценки удовлетворенности." },
  "Use your microphone to capture a call recording, then upload it directly.": { hy: "Օգտագործեք խոսափողը՝ զանգը ձայնագրելու և անմիջապես վերբեռնելու համար։", ru: "Запишите звонок с помощью микрофона, а затем загрузите запись напрямую." },
  "Account": { hy: "Հաշիվ", ru: "Аккаунт" },
  "Account unavailable": { hy: "Հաշիվը հասանելի չէ", ru: "Аккаунт недоступен" },
  "Action": { hy: "Գործողություն", ru: "Действие" },
  "Action:": { hy: "Գործողություն՝", ru: "Действие:" },
  "Actions": { hy: "Գործողություններ", ru: "Действия" },
  "Active": { hy: "Ակտիվ", ru: "Активен" },
  "Activate": { hy: "Ակտիվացնել", ru: "Активировать" },
  "Add bar": { hy: "Ավելացնել սյունակ", ru: "Добавить столбец" },
  "Add keyword": { hy: "Ավելացնել բանալի բառ", ru: "Добавить ключевое слово" },
  "Add question": { hy: "Ավելացնել հարց", ru: "Добавить вопрос" },
  "Add row": { hy: "Ավելացնել տող", ru: "Добавить строку" },
  "Add summary": { hy: "Ավելացնել ամփոփում", ru: "Добавить сводку" },
  "Admin": { hy: "Ադմինիստրատոր", ru: "Администратор" },
  "Agent": { hy: "Օպերատոր", ru: "Оператор" },
  "Agent Assist": { hy: "Օպերատորի օգնական", ru: "Помощник оператора" },
  "Agent Assist history": { hy: "Օպերատորի օգնականի պատմություն", ru: "История помощника оператора" },
  "Agent microphone": { hy: "Օպերատորի խոսափող", ru: "Микрофон оператора" },
  "Agent performance": { hy: "Օպերատորների արդյունավետություն", ru: "Эффективность операторов" },
  "Agent phones": { hy: "Օպերատորների հեռախոսներ", ru: "Телефоны операторов" },
  "Agent:": { hy: "Օպերատոր՝", ru: "Оператор:" },
  "Alert label": { hy: "Զգուշացման պիտակ", ru: "Метка предупреждения" },
  "Alert label:": { hy: "Զգուշացման պիտակ՝", ru: "Метка предупреждения:" },
  "All agents": { hy: "Բոլոր օպերատորները", ru: "Все операторы" },
  "All": { hy: "Բոլորը", ru: "Все" },
  "Search": { hy: "Որոնել", ru: "Поиск" },
  "selected": { hy: "ընտրված", ru: "выбрано" },
  "All password fields are required.": { hy: "Գաղտնաբառի բոլոր դաշտերը պարտադիր են։", ru: "Все поля пароля обязательны." },
  "All sentiment": { hy: "Բոլոր տրամադրությունները", ru: "Все тональности" },
  "All statuses": { hy: "Բոլոր կարգավիճակները", ru: "Все статусы" },
  "Answer": { hy: "Պատասխան", ru: "Ответ" },
  "Any": { hy: "Ցանկացած", ru: "Любой" },
  "API token": { hy: "API թոքեն", ru: "API-токен" },
  "API-token credentials cannot change a user password.": { hy: "API թոքենով մուտքը չի կարող փոխել օգտատիրոջ գաղտնաբառը։", ru: "Учетные данные API-токена не позволяют изменить пароль пользователя." },
  "Apply": { hy: "Կիրառել", ru: "Применить" },
  "Ask Anything": { hy: "Հարցրեք ցանկացած բան", ru: "Задайте любой вопрос" },
  "Ask Anything...": { hy: "Հարցրեք ցանկացած բան...", ru: "Задайте любой вопрос..." },
  "Asking": { hy: "Հարցում", ru: "Запрос" },
  "Asking...": { hy: "Հարցում...", ru: "Запрос..." },
  "Assigned agents": { hy: "Կցված օպերատորներ", ru: "Назначенные операторы" },
  "At least 8 characters": { hy: "Առնվազն 8 նիշ", ru: "Не менее 8 символов" },
  "Audit history": { hy: "Աուդիտի պատմություն", ru: "История аудита" },
  "Authorization": { hy: "Նույնականացում", ru: "Авторизация" },
  "Authorize": { hy: "Լիազորել", ru: "Авторизовать" },
  "Average attributes": { hy: "Միջին հատկանիշներ", ru: "Средние характеристики" },
  "Average QA score": { hy: "QA միջին գնահատական", ru: "Средняя оценка QA" },
  "Avg. QA": { hy: "Միջին QA", ru: "Средний QA" },
  "Avg. question score": { hy: "Հարցի միջին գնահատական", ru: "Средняя оценка вопроса" },
  "Back to dashboard": { hy: "Վերադառնալ վահանակ", ru: "Вернуться на панель" },
  "Badge color": { hy: "Պիտակի գույն", ru: "Цвет метки" },
  "Bar": { hy: "Սյունակ", ru: "Столбец" },
  "Bars": { hy: "Սյունակներ", ru: "Столбцы" },
  "Base URL": { hy: "Հիմնական URL", ru: "Базовый URL" },
  "Business priorities": { hy: "Բիզնես առաջնահերթություններ", ru: "Бизнес-приоритеты" },
  "Call Analytics Dashboard": { hy: "Զանգերի վերլուծության վահանակ", ru: "Панель аналитики звонков" },
  "Call detail": { hy: "Զանգի մանրամասներ", ru: "Детали звонка" },
  "Call direction": { hy: "Զանգի ուղղություն", ru: "Направление звонка" },
  "Call explorer": { hy: "Զանգերի դիտարկիչ", ru: "Обзор звонков" },
  "Call not available": { hy: "Զանգը հասանելի չէ", ru: "Звонок недоступен" },
  "Call summary": { hy: "Զանգերի ամփոփում", ru: "Сводка звонков" },
  "Call volume and the weakest QA question for each agent.": { hy: "Զանգերի քանակը և յուրաքանչյուր օպերատորի ամենաթույլ QA հարցը։", ru: "Объем звонков и самый слабый вопрос QA для каждого оператора." },
  "Calls": { hy: "Զանգեր", ru: "Звонки" },
  "Cancel": { hy: "Չեղարկել", ru: "Отмена" },
  "Change Password": { hy: "Փոխել գաղտնաբառը", ru: "Изменить пароль" },
  "Change password": { hy: "Փոխել գաղտնաբառը", ru: "Изменить пароль" },
  "Changing password…": { hy: "Գաղտնաբառը փոխվում է…", ru: "Изменение пароля…" },
  "Choose a new password with at least 8 characters.": { hy: "Ընտրեք առնվազն 8 նիշ պարունակող նոր գաղտնաբառ։", ru: "Выберите новый пароль длиной не менее 8 символов." },
  "Clear all": { hy: "Մաքրել բոլորը", ru: "Очистить всё" },
  "Close": { hy: "Փակել", ru: "Закрыть" },
  "Close answer": { hy: "Փակել պատասխանը", ru: "Закрыть ответ" },
  "Close demo call": { hy: "Փակել ցուցադրական զանգը", ru: "Закрыть демозвонок" },
  "Close edit mode": { hy: "Փակել խմբագրման ռեժիմը", ru: "Закрыть режим редактирования" },
  "Coaching Assistance": { hy: "Քոուչինգի աջակցություն", ru: "Помощь в обучении" },
  "Collapse": { hy: "Ծալել", ru: "Свернуть" },
  "Company ID": { hy: "Ընկերության ID", ru: "ID компании" },
  "Company QA Profile": { hy: "Ընկերության QA պրոֆիլ", ru: "Профиль QA компании" },
  "Company-wide call, sentiment, and agent QA performance.": { hy: "Ընկերության զանգերի, տրամադրության և օպերատորների QA արդյունավետությունը։", ru: "Общие показатели звонков, тональности и QA операторов." },
  "Complete": { hy: "Ավարտել", ru: "Завершить" },
  "Completed": { hy: "Ավարտված", ru: "Завершен" },
  "Configuration": { hy: "Կարգավորում", ru: "Конфигурация" },
  "Configured": { hy: "Կարգավորված", ru: "Настроено" },
  "Conversation": { hy: "Զրույց", ru: "Разговор" },
  "Conversation ID": { hy: "Զրույցի ID", ru: "ID разговора" },
  "Conversation ID for URL upload": { hy: "URL-ով վերբեռնման զրույցի ID", ru: "ID разговора для загрузки по URL" },
  "Conversation Playback": { hy: "Զրույցի նվագարկում", ru: "Воспроизведение разговора" },
  "Conversation Summarization": { hy: "Զրույցի ամփոփում", ru: "Резюме разговора" },
  "Conversations": { hy: "Զրույցներ", ru: "Разговоры" },
  "Copied": { hy: "Պատճենված է", ru: "Скопировано" },
  "Copy": { hy: "Պատճենել", ru: "Копировать" },
  "Copy original transcription": { hy: "Պատճենել սկզբնական տրանսկրիպցիան", ru: "Копировать исходную расшифровку" },
  "Create user": { hy: "Ստեղծել օգտատեր", ru: "Создать пользователя" },
  "Create users, control access, and assign visible agents.": { hy: "Ստեղծեք օգտատերեր, կառավարեք հասանելիությունը և կցեք տեսանելի օպերատորներ։", ru: "Создавайте пользователей, управляйте доступом и назначайте видимых операторов." },
  "Create workflow": { hy: "Ստեղծել աշխատանքային հոսք", ru: "Создать процесс" },
  "Created": { hy: "Ստեղծված", ru: "Создано" },
  "Created from": { hy: "Ստեղծված՝ սկսած", ru: "Создано с" },
  "Created from date": { hy: "Ստեղծման սկզբի ամսաթիվ", ru: "Дата начала создания" },
  "Created to": { hy: "Ստեղծված՝ մինչև", ru: "Создано по" },
  "Created to date": { hy: "Ստեղծման վերջի ամսաթիվ", ru: "Дата окончания создания" },
  "Credentials": { hy: "Մուտքային տվյալներ", ru: "Учетные данные" },
  "Cumulative": { hy: "Կուտակային", ru: "Совокупно" },
  "Current password": { hy: "Ընթացիկ գաղտնաբառ", ru: "Текущий пароль" },
  "Confirm new password": { hy: "Հաստատել նոր գաղտնաբառը", ru: "Подтвердите новый пароль" },
  "Customer": { hy: "Հաճախորդ", ru: "Клиент" },
  "Customer Concerns": { hy: "Հաճախորդի մտահոգություններ", ru: "Проблемы клиента" },
  "Customer intent": { hy: "Հաճախորդի մտադրություն", ru: "Намерение клиента" },
  "Customer microphone": { hy: "Հաճախորդի խոսափող", ru: "Микрофон клиента" },
  "Customer phones": { hy: "Հաճախորդների հեռախոսներ", ru: "Телефоны клиентов" },
  "Customer:": { hy: "Հաճախորդ՝", ru: "Клиент:" },
  "CSAT Score": { hy: "CSAT գնահատական", ru: "Оценка CSAT" },
  "Dashboard": { hy: "Վահանակ", ru: "Панель" },
  "Date / time": { hy: "Ամսաթիվ / ժամ", ru: "Дата / время" },
  "Datetime": { hy: "Ամսաթիվ և ժամ", ru: "Дата и время" },
  "Deactivate": { hy: "Ապաակտիվացնել", ru: "Деактивировать" },
  "Delete": { hy: "Ջնջել", ru: "Удалить" },
  "Department": { hy: "Բաժին", ru: "Отдел" },
  "Departments": { hy: "Բաժիններ", ru: "Отделы" },
  "Description": { hy: "Նկարագրություն", ru: "Описание" },
  "Diarization": { hy: "Խոսնակների տարբերակում", ru: "Диаризация" },
  "Direction": { hy: "Ուղղություն", ru: "Направление" },
  "Direction:": { hy: "Ուղղություն՝", ru: "Направление:" },
  "Disabled": { hy: "Անջատված", ru: "Отключено" },
  "Display name": { hy: "Ցուցադրվող անուն", ru: "Отображаемое имя" },
  "Done": { hy: "Պատրաստ է", ru: "Готово" },
  "Download": { hy: "Ներբեռնել", ru: "Скачать" },
  "Duration:": { hy: "Տևողություն՝", ru: "Длительность:" },
  "Earned points": { hy: "Վաստակած միավորներ", ru: "Набранные баллы" },
  "Edit": { hy: "Խմբագրել", ru: "Изменить" },
  "Edit header graphic": { hy: "Խմբագրել վերնագրի գրաֆիկը", ru: "Изменить график заголовка" },
  "Edit QA": { hy: "Խմբագրել QA-ն", ru: "Изменить QA" },
  "Edit user": { hy: "Խմբագրել օգտատիրոջը", ru: "Изменить пользователя" },
  "Edit workflow": { hy: "Խմբագրել աշխատանքային հոսքը", ru: "Изменить процесс" },
  "Email": { hy: "Էլ․ փոստ", ru: "Эл. почта" },
  "Emotion distribution": { hy: "Հույզերի բաշխում", ru: "Распределение эмоций" },
  "Emotional Timeline": { hy: "Հուզական ժամանակագիծ", ru: "Хронология эмоций" },
  "Enabled": { hy: "Միացված", ru: "Включено" },
  "Entities": { hy: "Էություններ", ru: "Сущности" },
  "Error": { hy: "Սխալ", ru: "Ошибка" },
  "Evaluated": { hy: "Գնահատված", ru: "Оценено" },
  "Exclude this call from QA?": { hy: "Բացառե՞լ այս զանգը QA-ից։", ru: "Исключить этот звонок из QA?" },
  "Explanation": { hy: "Բացատրություն", ru: "Объяснение" },
  "Explanation:": { hy: "Բացատրություն՝", ru: "Объяснение:" },
  "Export calls CSV": { hy: "Արտահանել զանգերի CSV", ru: "Экспорт звонков в CSV" },
  "Export QA monitoring questionnaire": { hy: "Արտահանել QA մոնիթորինգի հարցաշարը", ru: "Экспорт анкеты мониторинга QA" },
  "Exporting CSV...": { hy: "CSV-ն արտահանվում է...", ru: "Экспорт CSV..." },
  "Exporting QA questionnaires...": { hy: "QA հարցաշարերն արտահանվում են...", ru: "Экспорт анкет QA..." },
  "External ID": { hy: "Արտաքին ID", ru: "Внешний ID" },
  "Fail": { hy: "Չանցած", ru: "Не пройдено" },
  "Failed": { hy: "Ձախողված", ru: "Ошибка" },
  "Fetching transcript, diarization, and scoring data.": { hy: "Բեռնվում են տրանսկրիպցիան, խոսնակների տարբերակումը և գնահատման տվյալները։", ru: "Загружаются расшифровка, диаризация и данные оценки." },
  "Filter": { hy: "Զտիչ", ru: "Фильтр" },
  "Filters": { hy: "Զտիչներ", ru: "Фильтры" },
  "Friendliness": { hy: "Բարյացակամություն", ru: "Дружелюбие" },
  "From (UTC)": { hy: "Սկիզբ (UTC)", ru: "С (UTC)" },
  "Generate new ID": { hy: "Ստեղծել նոր ID", ru: "Создать новый ID" },
  "Generated": { hy: "Ստեղծված", ru: "Сформировано" },
  "Good": { hy: "Լավ", ru: "Хорошо" },
  "Excellent": { hy: "Գերազանց", ru: "Отлично" },
  "High": { hy: "Բարձր", ru: "Высокая" },
  "Low": { hy: "Ցածր", ru: "Низкая" },
  "Critical": { hy: "Կրիտիկական", ru: "Критическая" },
  "Headers": { hy: "Վերնագրեր", ru: "Заголовки" },
  "Hide": { hy: "Թաքցնել", ru: "Скрыть" },
  "Hide native controls": { hy: "Թաքցնել ներկառուցված կառավարիչները", ru: "Скрыть встроенные элементы управления" },
  "Hide QA": { hy: "Թաքցնել QA-ն", ru: "Скрыть QA" },
  "History": { hy: "Պատմություն", ru: "История" },
  "Inactive": { hy: "Ապաակտիվ", ru: "Неактивен" },
  "Inbound": { hy: "Մուտքային", ru: "Входящий" },
  "Improvements": { hy: "Բարելավումներ", ru: "Что улучшить" },
  "Keyword Alerts": { hy: "Բանալի բառերի ազդանշաններ", ru: "Оповещения по ключевым словам" },
  "Keyword or phrase": { hy: "Բանալի բառ կամ արտահայտություն", ru: "Ключевое слово или фраза" },
  "Keyword rules": { hy: "Բանալի բառերի կանոններ", ru: "Правила ключевых слов" },
  "Keyword:": { hy: "Բանալի բառ՝", ru: "Ключевое слово:" },
  "Language": { hy: "Լեզու", ru: "Язык" },
  "Last login": { hy: "Վերջին մուտք", ru: "Последний вход" },
  "Latest:": { hy: "Վերջինը՝", ru: "Последнее:" },
  "Loading analysis": { hy: "Վերլուծությունը բեռնվում է", ru: "Загрузка анализа" },
  "Loading audit history": { hy: "Աուդիտի պատմությունը բեռնվում է", ru: "Загрузка истории аудита" },
  "Loading call summary…": { hy: "Զանգերի ամփոփումը բեռնվում է…", ru: "Загрузка сводки звонков…" },
  "Loading deliveries": { hy: "Առաքումները բեռնվում են", ru: "Загрузка доставок" },
  "Loading provider configuration": { hy: "Մատակարարի կարգավորումը բեռնվում է", ru: "Загрузка конфигурации провайдера" },
  "Loading users…": { hy: "Օգտատերերը բեռնվում են…", ru: "Загрузка пользователей…" },
  "Loading voice connectors": { hy: "Ձայնային միակցիչները բեռնվում են", ru: "Загрузка голосовых подключений" },
  "Loading workflows": { hy: "Աշխատանքային հոսքերը բեռնվում են", ru: "Загрузка процессов" },
  "Loading...": { hy: "Բեռնվում է...", ru: "Загрузка..." },
  "Loading…": { hy: "Բեռնվում է…", ru: "Загрузка…" },
  "Local audio or MOV files": { hy: "Տեղային աուդիո կամ MOV ֆայլեր", ru: "Локальные аудио- или MOV-файлы" },
  "Log out": { hy: "Դուրս գալ", ru: "Выйти" },
  "Main Topic:": { hy: "Հիմնական թեմա՝", ru: "Основная тема:" },
  "Main topic": { hy: "Հիմնական թեմա", ru: "Основная тема" },
  "Manage the security settings for your user account.": { hy: "Կառավարեք ձեր օգտահաշվի անվտանգության կարգավորումները։", ru: "Управляйте настройками безопасности своего аккаунта." },
  "Manually corrected": { hy: "Ձեռքով ուղղված", ru: "Исправлено вручную" },
  "Mark as applicable": { hy: "Նշել որպես կիրառելի", ru: "Отметить как применимый" },
  "Mark as applicable for QA": { hy: "Նշել որպես QA-ի համար կիրառելի", ru: "Отметить как применимый для QA" },
  "Mark as not applicable": { hy: "Նշել որպես ոչ կիրառելի", ru: "Отметить как неприменимый" },
  "Mark as not applicable for QA": { hy: "Նշել որպես QA-ի համար ոչ կիրառելի", ru: "Отметить как неприменимый для QA" },
  "Maximum QA score": { hy: "QA առավելագույն գնահատական", ru: "Максимальная оценка QA" },
  "Max QA score": { hy: "QA առավելագույն գնահատական", ru: "Макс. оценка QA" },
  "Medium": { hy: "Միջին", ru: "Средне" },
  "Min QA score": { hy: "QA նվազագույն գնահատական", ru: "Мин. оценка QA" },
  "Minimum call duration for QA scoring": { hy: "QA գնահատման համար զանգի նվազագույն տևողություն", ru: "Минимальная длительность звонка для оценки QA" },
  "Missing": { hy: "Բացակա", ru: "Отсутствует" },
  "Mute": { hy: "Անջատել ձայնը", ru: "Выключить звук" },
  "Mute playback": { hy: "Անջատել նվագարկման ձայնը", ru: "Выключить звук воспроизведения" },
  "Name": { hy: "Անուն", ru: "Имя" },
  "Negative": { hy: "Բացասական", ru: "Негативная" },
  "Neutral": { hy: "Չեզոք", ru: "Нейтральная" },
  "Never": { hy: "Երբեք", ru: "Никогда" },
  "New password": { hy: "Նոր գաղտնաբառ", ru: "Новый пароль" },
  "New password for": { hy: "Նոր գաղտնաբառ՝", ru: "Новый пароль для" },
  "Next": { hy: "Հաջորդ", ru: "Далее" },
  "No": { hy: "Ոչ", ru: "Нет" },
  "No action set.": { hy: "Գործողություն սահմանված չէ։", ru: "Действие не задано." },
  "No agents have been assigned to your account. Contact your administrator.": { hy: "Ձեր հաշվին օպերատորներ կցված չեն։ Դիմեք ադմինիստրատորին։", ru: "К вашему аккаунту не назначены операторы. Обратитесь к администратору." },
  "No answer was returned.": { hy: "Պատասխան չի վերադարձվել։", ru: "Ответ не получен." },
  "No calls in this range": { hy: "Այս ժամանակահատվածում զանգեր չկան", ru: "В этом диапазоне нет звонков" },
  "No calls loaded yet": { hy: "Զանգեր դեռ բեռնված չեն", ru: "Звонки еще не загружены" },
  "No coaching assistance available.": { hy: "Քոուչինգի աջակցություն հասանելի չէ։", ru: "Рекомендации по обучению отсутствуют." },
  "No completed conversations": { hy: "Ավարտված զրույցներ չկան", ru: "Нет завершенных разговоров" },
  "No configured keywords were found in this transcript.": { hy: "Այս տրանսկրիպցիայում կարգավորված բանալի բառեր չեն գտնվել։", ru: "В этой расшифровке настроенные ключевые слова не найдены." },
  "No conversation summary available yet.": { hy: "Զրույցի ամփոփումը դեռ հասանելի չէ։", ru: "Резюме разговора пока недоступно." },
  "No customer concerns available.": { hy: "Հաճախորդի մտահոգություններ չկան։", ru: "Проблемы клиента не указаны." },
  "No deliveries yet": { hy: "Առաքումներ դեռ չկան", ru: "Доставок пока нет" },
  "No emotional signals available for this call.": { hy: "Այս զանգի համար հուզական ազդակներ չկան։", ru: "Для этого звонка нет эмоциональных сигналов." },
  "No keyword rules yet": { hy: "Բանալի բառերի կանոններ դեռ չկան", ru: "Правил ключевых слов пока нет" },
  "No language": { hy: "Լեզու նշված չէ", ru: "Язык не указан" },
  "No matching agents.": { hy: "Համապատասխան օպերատորներ չկան։", ru: "Подходящие операторы не найдены." },
  "No matching values": { hy: "Համապատասխան արժեքներ չկան", ru: "Совпадений нет" },
  "No minimum": { hy: "Նվազագույն չկա", ru: "Без минимума" },
  "No original transcription available yet.": { hy: "Սկզբնական տրանսկրիպցիան դեռ հասանելի չէ։", ru: "Исходная расшифровка пока недоступна." },
  "No passed questions": { hy: "Անցած հարցեր չկան", ru: "Нет пройденных вопросов" },
  "No providers match": { hy: "Համապատասխան մատակարարներ չկան", ru: "Подходящих провайдеров нет" },
  "No QA question results yet": { hy: "QA հարցերի արդյունքներ դեռ չկան", ru: "Результатов вопросов QA пока нет" },
  "No redacted transcription available yet.": { hy: "Ապանձնավորված տրանսկրիպցիան դեռ հասանելի չէ։", ru: "Отредактированная расшифровка пока недоступна." },
  "No snippet available.": { hy: "Հատվածը հասանելի չէ։", ru: "Фрагмент недоступен." },
  "No speaker segments available.": { hy: "Խոսնակների հատվածներ չկան։", ru: "Сегменты спикеров отсутствуют." },
  "No tips recorded for this update.": { hy: "Այս թարմացման համար խորհուրդներ չեն գրանցվել։", ru: "Для этого обновления советов нет." },
  "No users found": { hy: "Օգտատերեր չեն գտնվել", ru: "Пользователи не найдены" },
  "No values loaded": { hy: "Արժեքներ բեռնված չեն", ru: "Значения не загружены" },
  "No voice providers available": { hy: "Ձայնային մատակարարներ հասանելի չեն", ru: "Голосовые провайдеры недоступны" },
  "No workflow automations": { hy: "Ավտոմատացված հոսքեր չկան", ru: "Автоматизированных процессов нет" },
  "Not applicable": { hy: "Կիրառելի չէ", ru: "Неприменимо" },
  "Not configured": { hy: "Կարգավորված չէ", ru: "Не настроено" },
  "Not resolved": { hy: "Չլուծված", ru: "Не решено" },
  "Not scored": { hy: "Չգնահատված", ru: "Не оценено" },
  "Not tested": { hy: "Չստուգված", ru: "Не проверено" },
  "Open account settings": { hy: "Բացել հաշվի կարգավորումները", ru: "Открыть настройки аккаунта" },
  "Options": { hy: "Ընտրանքներ", ru: "Параметры" },
  "Original Transcription": { hy: "Սկզբնական տրանսկրիպցիա", ru: "Исходная расшифровка" },
  "Outbound": { hy: "Ելքային", ru: "Исходящий" },
  "Overall correction reason": { hy: "Ուղղման ընդհանուր պատճառ", ru: "Общая причина исправления" },
  "Page": { hy: "Էջ", ru: "Страница" },
  "Partner API token": { hy: "Գործընկերոջ API թոքեն", ru: "Партнерский API-токен" },
  "Pass": { hy: "Անցած", ru: "Пройдено" },
  "Passed": { hy: "Անցած", ru: "Пройдено" },
  "Passed questions": { hy: "Անցած հարցեր", ru: "Пройденные вопросы" },
  "Password": { hy: "Գաղտնաբառ", ru: "Пароль" },
  "Pending QA recalculation": { hy: "Սպասում է QA վերահաշվարկի", ru: "Ожидает перерасчета QA" },
  "Permission denied": { hy: "Մուտքը մերժված է", ru: "Доступ запрещен" },
  "Phone": { hy: "Հեռախոս", ru: "Телефон" },
  "Play conversation": { hy: "Նվագարկել զրույցը", ru: "Воспроизвести разговор" },
  "Positive": { hy: "Դրական", ru: "Позитивная" },
  "Possible points": { hy: "Հնարավոր միավորներ", ru: "Возможные баллы" },
  "Presigned URL": { hy: "Նախաստորագրված URL", ru: "Предварительно подписанный URL" },
  "Previous": { hy: "Նախորդ", ru: "Назад" },
  "Preview QA score": { hy: "QA գնահատականի նախադիտում", ru: "Предварительная оценка QA" },
  "Processing": { hy: "Մշակվում է", ru: "Обрабатывается" },
  "Processing error:": { hy: "Մշակման սխալ՝", ru: "Ошибка обработки:" },
  "Profile enabled": { hy: "Պրոֆիլը միացված է", ru: "Профиль включен" },
  "Profile name": { hy: "Պրոֆիլի անուն", ru: "Название профиля" },
  "Profile:": { hy: "Պրոֆիլ՝", ru: "Профиль:" },
  "QA details": { hy: "QA մանրամասներ", ru: "Детали QA" },
  "QA Evaluation": { hy: "QA գնահատում", ru: "Оценка QA" },
  "QA evaluation": { hy: "QA գնահատում", ru: "Оценка QA" },
  "QA not applicable": { hy: "QA-ն կիրառելի չէ", ru: "QA неприменим" },
  "QA not applicable:": { hy: "QA-ն կիրառելի չէ՝", ru: "QA неприменим:" },
  "QA profile not available": { hy: "QA պրոֆիլը հասանելի չէ", ru: "Профиль QA недоступен" },
  "QA recalculation is required to generate a new score.": { hy: "Նոր գնահատական ստանալու համար անհրաժեշտ է QA վերահաշվարկ։", ru: "Для получения новой оценки требуется перерасчет QA." },
  "QA Score": { hy: "QA գնահատական", ru: "Оценка QA" },
  "QA score": { hy: "QA գնահատական", ru: "Оценка QA" },
  "QA scoring": { hy: "QA գնահատում", ru: "Оценивание QA" },
  "QA settings": { hy: "QA կարգավորումներ", ru: "Настройки QA" },
  "QA-scored": { hy: "QA-ով գնահատված", ru: "Оценено QA" },
  "QA-scored calls": { hy: "QA-ով գնահատված զանգեր", ru: "Звонки с оценкой QA" },
  "Quality": { hy: "Որակ", ru: "Качество" },
  "Question": { hy: "Հարց", ru: "Вопрос" },
  "Question ID": { hy: "Հարցի ID", ru: "ID вопроса" },
  "Question results": { hy: "Հարցերի արդյունքներ", ru: "Результаты вопросов" },
  "Question:": { hy: "Հարց՝", ru: "Вопрос:" },
  "Queued": { hy: "Հերթագրված", ru: "В очереди" },
  "Raw Analysis": { hy: "Հում վերլուծություն", ru: "Исходный анализ" },
  "Reason": { hy: "Պատճառ", ru: "Причина" },
  "Reason: {{reason}}": { hy: "Պատճառ՝ {{reason}}", ru: "Причина: {{reason}}" },
  "Recalculate QA Score": { hy: "Վերահաշվարկել QA գնահատականը", ru: "Пересчитать оценку QA" },
  "Recalculating...": { hy: "Վերահաշվարկվում է...", ru: "Пересчет..." },
  "Record again": { hy: "Կրկին ձայնագրել", ru: "Записать снова" },
  "Record call": { hy: "Ձայնագրել զանգը", ru: "Записать звонок" },
  "Recording in progress": { hy: "Ձայնագրումն ընթացքի մեջ է", ru: "Идет запись" },
  "Recording ready": { hy: "Ձայնագրությունը պատրաստ է", ru: "Запись готова" },
  "Redacted Transcription": { hy: "Ապանձնավորված տրանսկրիպցիա", ru: "Отредактированная расшифровка" },
  "Refresh": { hy: "Թարմացնել", ru: "Обновить" },
  "Regenerate": { hy: "Նորից ստեղծել", ru: "Создать заново" },
  "Related Department:": { hy: "Առնչվող բաժին՝", ru: "Связанный отдел:" },
  "Remove": { hy: "Հեռացնել", ru: "Удалить" },
  "Reporting": { hy: "Հաշվետվություններ", ru: "Отчетность" },
  "Required action": { hy: "Պահանջվող գործողություն", ru: "Необходимое действие" },
  "Reset": { hy: "Վերակայել", ru: "Сбросить" },
  "Reset defaults": { hy: "Վերականգնել լռելյայնը", ru: "Сбросить настройки" },
  "Reset password": { hy: "Վերակայել գաղտնաբառը", ru: "Сбросить пароль" },
  "Resetting…": { hy: "Վերակայվում է…", ru: "Сброс…" },
  "Resolution status": { hy: "Լուծման կարգավիճակ", ru: "Статус решения" },
  "Resolved": { hy: "Լուծված", ru: "Решено" },
  "Restore QA applicability?": { hy: "Վերականգնե՞լ QA կիրառելիությունը։", ru: "Восстановить применимость QA?" },
  "Result": { hy: "Արդյունք", ru: "Результат" },
  "Return to dashboard": { hy: "Վերադառնալ վահանակ", ru: "Вернуться на панель" },
  "Role": { hy: "Դեր", ru: "Роль" },
  "Role mapping": { hy: "Դերերի համապատասխանեցում", ru: "Сопоставление ролей" },
  "Rule": { hy: "Կանոն", ru: "Правило" },
  "Rules": { hy: "Կանոններ", ru: "Правила" },
  "Satisfaction": { hy: "Գոհունակություն", ru: "Удовлетворенность" },
  "Save connector": { hy: "Պահպանել միակցիչը", ru: "Сохранить подключение" },
  "Save QA corrections": { hy: "Պահպանել QA ուղղումները", ru: "Сохранить исправления QA" },
  "Save QA profile": { hy: "Պահպանել QA պրոֆիլը", ru: "Сохранить профиль QA" },
  "Save QA scoring settings": { hy: "Պահպանել QA գնահատման կարգավորումները", ru: "Сохранить настройки оценки QA" },
  "Save user": { hy: "Պահպանել օգտատիրոջը", ru: "Сохранить пользователя" },
  "Saving...": { hy: "Պահպանվում է...", ru: "Сохранение..." },
  "Saving…": { hy: "Պահպանվում է…", ru: "Сохранение…" },
  "Score summary": { hy: "Գնահատականների ամփոփում", ru: "Сводка оценок" },
  "Search agents": { hy: "Որոնել օպերատորներ", ru: "Поиск операторов" },
  "Search providers": { hy: "Որոնել մատակարարներ", ru: "Поиск провайдеров" },
  "Search transcript or metadata": { hy: "Որոնել տրանսկրիպցիայում կամ մետատվյալներում", ru: "Поиск по расшифровке или метаданным" },
  "Select a call": { hy: "Ընտրեք զանգ", ru: "Выберите звонок" },
  "Select all completed conversations": { hy: "Ընտրել բոլոր ավարտված զրույցները", ru: "Выбрать все завершенные разговоры" },
  "Select an option": { hy: "Ընտրեք տարբերակ", ru: "Выберите вариант" },
  "Send test": { hy: "Ուղարկել փորձարկում", ru: "Отправить тест" },
  "Sentiment": { hy: "Տրամադրություն", ru: "Тональность" },
  "Sentiment distribution": { hy: "Տրամադրությունների բաշխում", ru: "Распределение тональности" },
  "Sentiment overview": { hy: "Տրամադրությունների ակնարկ", ru: "Обзор тональности" },
  "Show": { hy: "Ցուցադրել", ru: "Показать" },
  "Show native controls": { hy: "Ցուցադրել ներկառուցված կառավարիչները", ru: "Показать встроенные элементы управления" },
  "Show QA": { hy: "Ցուցադրել QA-ն", ru: "Показать QA" },
  "Sign in": { hy: "Մուտք գործել", ru: "Войти" },
  "Sign-in method": { hy: "Մուտքի եղանակ", ru: "Способ входа" },
  "Signing in...": { hy: "Մուտք է կատարվում...", ru: "Вход..." },
  "Single call": { hy: "Մեկ զանգ", ru: "Один звонок" },
  "Solution:": { hy: "Լուծում՝", ru: "Решение:" },
  "Speed": { hy: "Արագություն", ru: "Скорость" },
  "Start": { hy: "Սկսել", ru: "Начать" },
  "Status": { hy: "Կարգավիճակ", ru: "Статус" },
  "Stop": { hy: "Կանգնեցնել", ru: "Остановить" },
  "Stop recording": { hy: "Կանգնեցնել ձայնագրումը", ru: "Остановить запись" },
  "Strengths": { hy: "Ուժեղ կողմեր", ru: "Сильные стороны" },
  "Summaries": { hy: "Ամփոփումներ", ru: "Сводки" },
  "Summary": { hy: "Ամփոփում", ru: "Резюме" },
  "Task Urgency:": { hy: "Առաջադրանքի հրատապություն՝", ru: "Срочность задачи:" },
  "Task urgency": { hy: "Առաջադրանքի հրատապություն", ru: "Срочность задачи" },
  "Task urgencies": { hy: "Առաջադրանքի հրատապություններ", ru: "Срочность задач" },
  "Test connection": { hy: "Ստուգել կապը", ru: "Проверить подключение" },
  "Testing…": { hy: "Ստուգվում է…", ru: "Проверка…" },
  "The call detail view will appear here.": { hy: "Զանգի մանրամասներն այստեղ կհայտնվեն։", ru: "Здесь появятся детали звонка." },
  "The conversation ID is generated automatically for each upload.": { hy: "Յուրաքանչյուր վերբեռնման համար զրույցի ID-ն ստեղծվում է ավտոմատ։", ru: "ID разговора создается автоматически для каждой загрузки." },
  "The QA status will become pending. The previous score will not be restored.": { hy: "QA կարգավիճակը կդառնա սպասող։ Նախորդ գնահատականը չի վերականգնվի։", ru: "Статус QA станет ожидающим. Предыдущая оценка не будет восстановлена." },
  "Title": { hy: "Վերնագիր", ru: "Название" },
  "To (UTC)": { hy: "Ավարտ (UTC)", ru: "По (UTC)" },
  "Topic": { hy: "Թեմա", ru: "Тема" },
  "Topic:": { hy: "Թեմա՝", ru: "Тема:" },
  "Topics": { hy: "Թեմաներ", ru: "Темы" },
  "Topics:": { hy: "Թեմաներ՝", ru: "Темы:" },
  "Total calls": { hy: "Ընդհանուր զանգեր", ru: "Всего звонков" },
  "Total calls duration": { hy: "Զանգերի ընդհանուր տևողություն", ru: "Общая длительность звонков" },
  "Try again": { hy: "Կրկին փորձել", ru: "Повторить" },
  "Unknown": { hy: "Անհայտ", ru: "Неизвестно" },
  "Unknown call": { hy: "Անհայտ զանգ", ru: "Неизвестный звонок" },
  "Unknown sentiment calls": { hy: "Անհայտ տրամադրությամբ զանգեր", ru: "Звонки с неизвестной тональностью" },
  "Unmute": { hy: "Միացնել ձայնը", ru: "Включить звук" },
  "Unmute playback": { hy: "Միացնել նվագարկման ձայնը", ru: "Включить звук воспроизведения" },
  "Updated": { hy: "Թարմացված", ru: "Обновлено" },
  "Updating...": { hy: "Թարմացվում է...", ru: "Обновление..." },
  "Upload call": { hy: "Վերբեռնել զանգ", ru: "Загрузить звонок" },
  "Upload recording": { hy: "Վերբեռնել ձայնագրությունը", ru: "Загрузить запись" },
  "Uploading...": { hy: "Վերբեռնվում է...", ru: "Загрузка..." },
  "User": { hy: "Օգտատեր", ru: "Пользователь" },
  "User account": { hy: "Օգտատիրոջ հաշիվ", ru: "Учетная запись" },
  "User Management": { hy: "Օգտատերերի կառավարում", ru: "Управление пользователями" },
  "Video Analysis": { hy: "Տեսանյութի վերլուծություն", ru: "Анализ видео" },
  "View": { hy: "Դիտել", ru: "Открыть" },
  "Visible calls": { hy: "Տեսանելի զանգեր", ru: "Видимые звонки" },
  "Voice Connectors": { hy: "Ձայնային միակցիչներ", ru: "Голосовые подключения" },
  "Voice providers": { hy: "Ձայնային մատակարարներ", ru: "Голосовые провайдеры" },
  "Weakest QA question": { hy: "Ամենաթույլ QA հարց", ru: "Самый слабый вопрос QA" },
  "Weight": { hy: "Կշիռ", ru: "Вес" },
  "Weighted percentage": { hy: "Կշռված տոկոս", ru: "Взвешенный процент" },
  "Weighted questions": { hy: "Կշռված հարցեր", ru: "Взвешенные вопросы" },
  "Why should this call be excluded from QA?": { hy: "Ինչո՞ւ պետք է այս զանգը բացառվի QA-ից։", ru: "Почему этот звонок следует исключить из QA?" },
  "Workflow Automations": { hy: "Աշխատանքային հոսքերի ավտոմատացում", ru: "Автоматизация процессов" },
  "Workflows": { hy: "Աշխատանքային հոսքեր", ru: "Процессы" },
  "Workspace": { hy: "Աշխատանքային տարածք", ru: "Рабочее пространство" },
  "Yes": { hy: "Այո", ru: "Да" },
  "You": { hy: "Դուք", ru: "Вы" },
  "You cannot deactivate yourself": { hy: "Դուք չեք կարող ապաակտիվացնել ինքներդ ձեզ", ru: "Нельзя деактивировать собственную учетную запись" },
  "Text Connector Lab": { hy: "Տեքստային միակցիչների լաբորատորիա", ru: "Лаборатория текстовых коннекторов" },
  "TEXT CONNECTORS": { hy: "ՏԵՔՍՏԱՅԻՆ ՄԻԱՑՈՒՑԻՉՆԵՐ", ru: "ТЕКСТОВЫЕ КОННЕКТОРЫ" },
  "Admin · Connector testing": { hy: "Ադմին · Միակցիչների փորձարկում", ru: "Администратор · Тестирование коннекторов" },
  "Webhook replay tool": { hy: "Webhook վերարտադրման գործիք", ru: "Инструмент повтора webhook" },
  "Normalization only": { hy: "Միայն նորմալացում", ru: "Только нормализация" },
  "Provider selection": { hy: "Մատակարարի ընտրություն", ru: "Выбор провайдера" },
  "Backend catalog": { hy: "Backend կատալոգ", ru: "Каталог backend" },
  "Webhook replay editor": { hy: "Webhook վերարտադրման խմբագրիչ", ru: "Редактор повтора webhook" },
  "Raw provider webhook JSON": { hy: "Մատակարարի սկզբնական webhook JSON", ru: "Исходный JSON webhook провайдера" },
  "Format JSON": { hy: "Ձևաչափել JSON-ը", ru: "Форматировать JSON" },
  "Load Example": { hy: "Բեռնել օրինակ", ru: "Загрузить пример" },
  "Normalize webhook": { hy: "Նորմալացնել webhook-ը", ru: "Нормализовать webhook" },
  "Validation checklist": { hy: "Ստուգման ցանկ", ru: "Контрольный список" },
  "Session only": { hy: "Միայն ընթացիկ սեսիա", ru: "Только текущий сеанс" },
  "Manual check": { hy: "Ձեռքով ստուգում", ru: "Ручная проверка" },
  "Replay comparison": { hy: "Վերարտադրումների համեմատություն", ru: "Сравнение повторов" },
  "Clear History": { hy: "Մաքրել պատմությունը", ru: "Очистить историю" },
  "Normalized result": { hy: "Նորմալացված արդյունք", ru: "Нормализованный результат" },
  "Latest replay": { hy: "Վերջին վերարտադրում", ru: "Последний повтор" },
  "Provider event type": { hy: "Մատակարարի իրադարձության տեսակ", ru: "Тип события провайдера" },
  "Message ID": { hy: "Հաղորդագրության ID", ru: "ID сообщения" },
  "Sender role": { hy: "Ուղարկողի դեր", ru: "Роль отправителя" },
  "Event ID": { hy: "Իրադարձության ID", ru: "ID события" },
  "Time replayed": { hy: "Վերարտադրման ժամ", ru: "Время повтора" },
  "Original source payload": { hy: "Սկզբնական աղբյուրի payload", ru: "Исходная полезная нагрузка" },
  "Normalized event JSON": { hy: "Նորմալացված իրադարձության JSON", ru: "JSON нормализованного события" },
  "Attachments": { hy: "Կցորդներ", ru: "Вложения" },
  "Warnings": { hy: "Զգուշացումներ", ru: "Предупреждения" },
  "History validation": { hy: "Պատմության ստուգում", ru: "Проверка истории" },
  "Live webhook security": { hy: "Ուղիղ webhook-ի անվտանգություն", ru: "Безопасность живого webhook" },
  "Deduplication event ID": { hy: "Ապակրկնօրինակման իրադարձության ID", ru: "ID события дедупликации" },
  "Hydration required": { hy: "Հարստացում է պահանջվում", ru: "Требуется дополнение данных" },
  "Message text": { hy: "Հաղորդագրության տեքստ", ru: "Текст сообщения" },
  "Provider documentation ↗": { hy: "Մատակարարի փաստաթղթեր ↗", ru: "Документация провайдера ↗" },
  "Language preference could not be saved. Your previous language was restored.": { hy: "Լեզվի նախապատվությունը չհաջողվեց պահպանել։ Նախորդ լեզուն վերականգնվել է։", ru: "Не удалось сохранить выбор языка. Предыдущий язык восстановлен." },
} as const;

export type TranslationKey = keyof typeof messages;
export type TranslationParams = Record<string, string | number>;

export const catalogs: Record<LocaleCode, Record<TranslationKey, string>> = {
  en: Object.fromEntries(Object.keys(messages).map((key) => [key, key])) as Record<TranslationKey, string>,
  hy: Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, value.hy])) as Record<TranslationKey, string>,
  ru: Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, value.ru])) as Record<TranslationKey, string>,
};

export const isLocaleCode = (value: unknown): value is LocaleCode =>
  value === "en" || value === "hy" || value === "ru";

export const normalizeLocale = (value: unknown): LocaleCode | null => {
  if (typeof value !== "string") return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLocaleCode(base) ? base : null;
};

const availableCodes = (options: UiLocalizationOptionsResponse) =>
  new Set(options.supportedLocales.map((option) => option.code));

export const sanitizeLocalizationOptions = (
  value: UiLocalizationOptionsResponse | null | undefined,
): UiLocalizationOptionsResponse => {
  if (!value || !Array.isArray(value.supportedLocales)) {
    return BUILTIN_LOCALIZATION_OPTIONS;
  }

  const unique = new Map<LocaleCode, UiLocaleOption>();
  value.supportedLocales.forEach((option) => {
    const code = normalizeLocale(option?.code);
    if (!code || unique.has(code)) return;
    const fallback = BUILTIN_LOCALIZATION_OPTIONS.supportedLocales.find((item) => item.code === code)!;
    unique.set(code, {
      code,
      englishName: option.englishName?.trim() || fallback.englishName,
      nativeName: option.nativeName?.trim() || fallback.nativeName,
      textDirection: option.textDirection === "rtl" ? "rtl" : "ltr",
    });
  });

  if (unique.size === 0) return BUILTIN_LOCALIZATION_OPTIONS;
  if (!unique.has("en")) {
    unique.set("en", BUILTIN_LOCALIZATION_OPTIONS.supportedLocales[0]);
  }
  const supportedLocales = [...unique.values()];
  const requestedDefault = normalizeLocale(value.defaultLocale);
  return {
    defaultLocale:
      requestedDefault && unique.has(requestedDefault) ? requestedDefault : "en",
    supportedLocales,
  };
};

export const resolvePreLoginLocale = (
  storedLocale: unknown,
  browserLocales: readonly string[] = [],
  options: UiLocalizationOptionsResponse = BUILTIN_LOCALIZATION_OPTIONS,
): LocaleCode => {
  const sanitized = sanitizeLocalizationOptions(options);
  const supported = availableCodes(sanitized);
  const stored = normalizeLocale(storedLocale);
  if (stored && supported.has(stored)) return stored;
  for (const browserLocale of browserLocales) {
    const normalized = normalizeLocale(browserLocale);
    if (normalized && supported.has(normalized)) return normalized;
  }
  return sanitized.defaultLocale;
};

export const resolveAuthenticatedLocale = (
  preferredLocale: unknown,
  preLoginLocale: unknown,
  options: UiLocalizationOptionsResponse = BUILTIN_LOCALIZATION_OPTIONS,
): LocaleCode => {
  const sanitized = sanitizeLocalizationOptions(options);
  const supported = availableCodes(sanitized);
  if (preferredLocale == null || preferredLocale === "") return "en";
  const preferred = normalizeLocale(preferredLocale);
  if (preferred && supported.has(preferred)) return preferred;
  const preLogin = normalizeLocale(preLoginLocale);
  if (preLogin && supported.has(preLogin)) return preLogin;
  return sanitized.defaultLocale;
};

export const intlLocaleFor = (locale: LocaleCode) =>
  locale === "hy" ? "hy-AM" : locale === "ru" ? "ru-RU" : "en-US";

let currentIntlLocale = "en-US";
export const getIntlLocale = () => currentIntlLocale;

const interpolate = (template: string, params?: TranslationParams) =>
  params
    ? template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params[key] ?? `{{${key}}}`))
    : template;

export const translate = (
  locale: LocaleCode,
  key: TranslationKey,
  params?: TranslationParams,
) => interpolate(catalogs[locale]?.[key] ?? catalogs.en[key] ?? key, params);

export const translateEnumValue = (
  locale: LocaleCode,
  category: "sentiment" | "status" | "urgency" | "direction" | "qaApplicability" | "role",
  value?: string | boolean | null,
) => {
  if (value == null || value === "") return translate(locale, "Unknown");
  const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  const keys: Partial<Record<string, TranslationKey>> = {
    positive: "Positive",
    neutral: "Neutral",
    negative: "Negative",
    queued: "Queued",
    processing: "Processing",
    in_progress: "Processing",
    completed: "Completed",
    failed: "Failed",
    active: "Active",
    inactive: "Inactive",
    inbound: "Inbound",
    outbound: "Outbound",
    true: category === "qaApplicability" ? "Yes" : "Active",
    false: category === "qaApplicability" ? "No" : "Inactive",
    admin: "Admin",
    user: "User",
    medium: "Medium",
    good: "Good",
    excellent: "Excellent",
    high: "High",
    low: "Low",
    critical: "Critical",
    available: "Available",
    experimental: "Experimental",
    adapter_required: "Adapter Required",
    testing: "Testing",
    connected: "Connected",
    credentials_rejected: "Credentials Rejected",
    unavailable: "Unavailable",
    timeout: "Timeout",
    delivered: "Delivered",
    success: "Success",
    pending: "Pending",
    not_applicable: "Not applicable",
    resolved: "Resolved",
  };
  if (category === "direction" && typeof value === "boolean") {
    return translate(locale, value ? "Inbound" : "Outbound");
  }
  const key = keys[normalized];
  return key ? translate(locale, key) : String(value);
};

export async function persistLocaleOptimistically({
  previousLocale,
  nextLocale,
  applyLocale,
  persist,
}: {
  previousLocale: LocaleCode;
  nextLocale: LocaleCode;
  applyLocale: (locale: LocaleCode) => void;
  persist: (locale: LocaleCode) => Promise<LocaleCode>;
}) {
  applyLocale(nextLocale);
  try {
    const authoritativeLocale = await persist(nextLocale);
    applyLocale(authoritativeLocale);
    return authoritativeLocale;
  } catch (error) {
    applyLocale(previousLocale);
    throw error;
  }
}

type I18nContextValue = {
  locale: LocaleCode;
  intlLocale: string;
  options: UiLocalizationOptionsResponse;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  setLocale: (locale: LocaleCode) => void;
  configureOptions: (options: UiLocalizationOptionsResponse) => void;
  applyAuthenticatedLocale: (preferredLocale: unknown, preLoginLocale?: unknown) => LocaleCode;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency: string, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  enumLabel: (
    category: "sentiment" | "status" | "urgency" | "direction" | "qaApplicability" | "role",
    value?: string | boolean | null,
  ) => string;
};

const defaultContext: I18nContextValue = {
  locale: "en",
  intlLocale: "en-US",
  options: BUILTIN_LOCALIZATION_OPTIONS,
  t: (key, params) => interpolate(key, params),
  setLocale: () => undefined,
  configureOptions: () => undefined,
  applyAuthenticatedLocale: () => "en",
  formatNumber: (value, options) => new Intl.NumberFormat("en-US", options).format(value),
  formatPercent: (value, options) =>
    new Intl.NumberFormat("en-US", { style: "percent", ...options }).format(value),
  formatCurrency: (value, currency, options) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, ...options }).format(value),
  formatDate: (value, options) =>
    new Intl.DateTimeFormat("en-US", options).format(new Date(value)),
  enumLabel: (category, value) => translateEnumValue("en", category, value),
};

const I18nContext = createContext<I18nContextValue>(defaultContext);

const staticTextLookup = new Map<string, TranslationKey>();
Object.keys(catalogs.en).forEach((key) => {
  const typedKey = key as TranslationKey;
  (Object.keys(catalogs) as LocaleCode[]).forEach((locale) => {
    staticTextLookup.set(catalogs[locale][typedKey], typedKey);
  });
});

const translatedNodes = new WeakMap<Node, TranslationKey>();

const translateTextValue = (value: string, locale: LocaleCode, knownKey?: TranslationKey) => {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const normalized = value.trim().replace(/\s+/g, " ");
  const knownKeyStillMatches =
    knownKey != null &&
    (Object.keys(catalogs) as LocaleCode[]).some(
      (catalogLocale) => catalogs[catalogLocale][knownKey] === normalized,
    );
  const key = knownKeyStillMatches ? knownKey : staticTextLookup.get(normalized);
  if (!key) return null;
  return { key, value: `${leading}${catalogs[locale][key]}${trailing}` };
};

const localizeDom = (root: ParentNode, locale: LocaleCode) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (
      parent &&
      !parent.closest("[data-i18n-skip]") &&
      !parent.closest("script, style, code, pre")
    ) {
      const result = translateTextValue(node.nodeValue ?? "", locale, translatedNodes.get(node));
      if (result) {
        translatedNodes.set(node, result.key);
        if (node.nodeValue !== result.value) node.nodeValue = result.value;
      } else {
        translatedNodes.delete(node);
      }
    }
    node = walker.nextNode();
  }

  const elements = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
  elements.forEach((element) => {
    if (element.closest("[data-i18n-skip]")) return;
    ["placeholder", "aria-label", "title", "alt"].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (!value) return;
      const key = staticTextLookup.get(value.trim().replace(/\s+/g, " "));
      if (key) element.setAttribute(attribute, catalogs[locale][key]);
    });
  });
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const initialPreLoginLocaleRef = useRef<LocaleCode>(
    resolvePreLoginLocale(
      typeof localStorage === "undefined" ? null : localStorage.getItem(LOCALE_STORAGE_KEY),
      typeof navigator === "undefined" ? [] : navigator.languages,
    ),
  );
  const [options, setOptions] = useState(BUILTIN_LOCALIZATION_OPTIONS);
  const [locale, setLocaleState] = useState<LocaleCode>(initialPreLoginLocaleRef.current);

  currentIntlLocale = intlLocaleFor(locale);

  const setLocale = useCallback((nextLocale: LocaleCode) => {
    setLocaleState((current) => {
      if (current === nextLocale) return current;
      return nextLocale;
    });
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    }
  }, []);

  const configureOptions = useCallback((nextOptions: UiLocalizationOptionsResponse) => {
    const sanitized = sanitizeLocalizationOptions(nextOptions);
    setOptions(sanitized);
    const resolved = resolvePreLoginLocale(
      typeof localStorage === "undefined" ? null : localStorage.getItem(LOCALE_STORAGE_KEY),
      typeof navigator === "undefined" ? [] : navigator.languages,
      sanitized,
    );
    setLocaleState(resolved);
  }, []);

  const applyAuthenticatedLocale = useCallback(
    (preferredLocale: unknown, preLoginLocale: unknown = initialPreLoginLocaleRef.current) => {
      const resolved = resolveAuthenticatedLocale(preferredLocale, preLoginLocale, options);
      setLocale(resolved);
      return resolved;
    },
    [options, setLocale],
  );

  useEffect(() => {
    const activeOption =
      options.supportedLocales.find((option) => option.code === locale) ??
      BUILTIN_LOCALIZATION_OPTIONS.supportedLocales[0];
    document.documentElement.lang = locale;
    document.documentElement.dir = activeOption.textDirection;
    currentIntlLocale = intlLocaleFor(locale);
    localizeDom(document.body, locale);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === "characterData" && record.target.parentNode) {
          localizeDom(record.target.parentNode, locale);
        }
        record.addedNodes.forEach((added) => {
          if (added.nodeType === Node.ELEMENT_NODE) localizeDom(added as Element, locale);
          else if (added.parentNode) localizeDom(added.parentNode, locale);
        });
      });
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [locale, options]);

  const value = useMemo<I18nContextValue>(() => {
    const intlLocale = intlLocaleFor(locale);
    return {
      locale,
      intlLocale,
      options,
      t: (key, params) => translate(locale, key, params),
      setLocale,
      configureOptions,
      applyAuthenticatedLocale,
      formatNumber: (number, numberOptions) =>
        new Intl.NumberFormat(intlLocale, numberOptions).format(number),
      formatPercent: (number, numberOptions) =>
        new Intl.NumberFormat(intlLocale, { style: "percent", ...numberOptions }).format(number),
      formatCurrency: (number, currency, numberOptions) =>
        new Intl.NumberFormat(intlLocale, {
          style: "currency",
          currency,
          ...numberOptions,
        }).format(number),
      formatDate: (date, dateOptions) =>
        new Intl.DateTimeFormat(intlLocale, dateOptions).format(new Date(date)),
      enumLabel: (category, enumValue) =>
        translateEnumValue(locale, category, enumValue),
    };
  }, [applyAuthenticatedLocale, configureOptions, locale, options, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

function LocaleFlag({ code }: { code: LocaleCode }) {
  const sharedProps = {
    className: "language-flag-icon",
    "data-locale-flag": code,
    "aria-hidden": true,
    focusable: "false",
  } as const;

  if (code === "en") {
    return (
      <svg {...sharedProps} viewBox="0 0 30 16" xmlns="http://www.w3.org/2000/svg">
        <rect width="30" height="16" fill="#fff" />
        <path
          d="M0 0h30v1.23H0zm0 2.46h30v1.23H0zm0 2.46h30v1.23H0zm0 2.46h30v1.23H0zm0 2.46h30v1.23H0zm0 2.46h30v1.23H0zm0 2.46h30V16H0z"
          fill="#b22234"
        />
        <rect width="12" height="8.62" fill="#3c3b6e" />
        <g fill="#fff">
          <circle cx="2" cy="1.5" r="0.45" /><circle cx="5" cy="1.5" r="0.45" />
          <circle cx="8" cy="1.5" r="0.45" /><circle cx="11" cy="1.5" r="0.45" />
          <circle cx="3.5" cy="3.5" r="0.45" /><circle cx="6.5" cy="3.5" r="0.45" />
          <circle cx="9.5" cy="3.5" r="0.45" /><circle cx="2" cy="5.5" r="0.45" />
          <circle cx="5" cy="5.5" r="0.45" /><circle cx="8" cy="5.5" r="0.45" />
          <circle cx="11" cy="5.5" r="0.45" /><circle cx="3.5" cy="7.5" r="0.45" />
          <circle cx="6.5" cy="7.5" r="0.45" /><circle cx="9.5" cy="7.5" r="0.45" />
        </g>
      </svg>
    );
  }

  if (code === "hy") {
    return (
      <svg {...sharedProps} viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg">
        <path fill="#d90012" d="M0 0h30v5H0z" />
        <path fill="#0033a0" d="M0 5h30v5H0z" />
        <path fill="#f2a800" d="M0 10h30v5H0z" />
      </svg>
    );
  }

  return (
    <svg {...sharedProps} viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg">
      <path fill="#fff" d="M0 0h30v6.67H0z" />
      <path fill="#0039a6" d="M0 6.67h30v6.66H0z" />
      <path fill="#d52b1e" d="M0 13.33h30V20H0z" />
    </svg>
  );
}

export function LanguageSelector({
  onChange,
  disabled = false,
  className = "",
}: {
  onChange?: (locale: LocaleCode) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const { locale, options, setLocale, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedLocale = options.supportedLocales.find((option) => option.code === locale)
    ?? options.supportedLocales[0];

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  if (!selectedLocale) return null;

  return (
    <div
      ref={dropdownRef}
      className={`language-selector ${className}`.trim()}
    >
      <button
        type="button"
        className="language-dropdown-trigger"
        disabled={disabled}
        aria-label={`${t("Language")}: ${selectedLocale.nativeName}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <LocaleFlag code={selectedLocale.code} />
        <span className="language-dropdown-chevron" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="language-dropdown-menu" role="menu" aria-label={t("Language")}>
          {options.supportedLocales.map((option) => (
            <button
              key={option.code}
              type="button"
              role="menuitemradio"
              className={`language-dropdown-option ${locale === option.code ? "is-active" : ""}`}
              aria-label={option.nativeName}
              aria-checked={locale === option.code}
              onClick={() => {
                setIsOpen(false);
                if (option.code === locale) return;
                if (onChange) void onChange(option.code);
                else setLocale(option.code);
              }}
            >
              <LocaleFlag code={option.code} />
              <span className="language-dropdown-option-name">{option.nativeName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
