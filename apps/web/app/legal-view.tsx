import type {ReactNode} from 'react';
import {readReleaseConfig} from '../../../packages/domain/src/release-config';

/** Server-component helper: private approval text never becomes client configuration. */
export function readWebReleaseConfig(env:Readonly<Record<string,string|undefined>>=process.env){
  return readReleaseConfig({
    demo:env.NEXT_PUBLIC_DEMO,
    legalApproved:env.GIFT_LEGAL_APPROVED,
    rulesUrl:env.NEXT_PUBLIC_RULES_URL,
    rulesUpdatedAt:env.NEXT_PUBLIC_RULES_UPDATED_AT,
    rulesApproved:env.GIFT_RULES_APPROVED,
    rulesText:env.GIFT_RULES_TEXT,
    requireLegalText:true,
    apiOrigin:env.NEXT_PUBLIC_API_ORIGIN,
    publicOrigin:env.NEXT_PUBLIC_PUBLIC_ORIGIN,
    supportContact:env.NEXT_PUBLIC_SUPPORT_CONTACT,
    operatorName:env.NEXT_PUBLIC_OPERATOR_NAME,
    privacyPolicyUrl:env.NEXT_PUBLIC_PRIVACY_POLICY_URL,
    supportUrl:env.NEXT_PUBLIC_SUPPORT_URL,
    privacyText:env.GIFT_PRIVACY_TEXT,
    privacyUpdatedAt:env.GIFT_PRIVACY_UPDATED_AT,
  });
}
export type LegalConfig=ReturnType<typeof readWebReleaseConfig>;

function LegalLayout({title,children}:{title:string;children:ReactNode}){
  return <main style={{maxWidth:800,margin:'0 auto',padding:'32px 24px',lineHeight:1.7}}>
    <nav aria-label="Основная навигация"><a href="/">Список подарков</a>{' · '}<a href="/privacy">Конфиденциальность</a>{' · '}<a href="/support">Поддержка</a>{' · '}<a href="/rules">Правила контента</a></nav>
    <h1>{title}</h1>{children}
  </main>;
}

const dataMap=[
  ['На устройстве','События, пожелания, цвета, тексты, дата, имена и черновики хранятся локально. На Android обычные данные находятся в Filesystem, секреты доступа — отдельно в Keystore/AES-GCM. Резервное копирование и перенос данных Android отключены.'],
  ['Публикация и гостевая ссылка','При онлайн-публикации сервер получает содержимое списка. Любой обладатель гостевой ссылки может видеть публичные имена, дату и пожелания: доступ не ограничен конкретными приглашёнными.'],
  ['Доступ и восстановление','Клиент создаёт случайные секреты доступа владельца, восстановления и гостя. Сервер хранит их SHA-256 verifiers, а не открытые секреты. Файл восстановления даёт полное управление: не отправляйте его гостям или в поддержку.'],
  ['Бронирование','Бронь связана с гостевым verifier и идентификатором. Полная анонимность не обещается; предусмотрены отмена, обработка повторных запросов и конфликтов.'],
  ['Технические данные и жалобы','Для защиты от злоупотреблений используются технические метаданные, ограничения запросов по IP и записи операций. Жалобы сохраняются в SQL. Состав журналов и сроки у реального хостинга, ответственный за модерацию и регламент ещё не утверждены.'],
  ['Удаление','Серверный процесс удаления удаляет контент владельца. Для служебных verifiers, записей операций и аудита предусмотрены ограниченные сроки. Резервные копии провайдера ещё не проверены; мгновенное удаление всех копий не обещается.'],
  ['Внешние сервисы и разрешения','Ссылки магазинов открываются внешним браузером. Автоматическая загрузка внешних фото отключена. В package.json нет отдельных SDK аналитики, рекламы или платежей; итоговый bundle требует аудита. Основной Android manifest запрашивает INTERNET; документы выбираются через SAF без общего доступа к хранилищу. Итоговый manifest плагинов требует проверки.'],
];

export function PrivacyView({config}:{config:LegalConfig}){
  return <LegalLayout title="Конфиденциальность">
    {config.demo?<>
      <p role="note"><strong>Демонстрационный режим.</strong> Это техническая карта данных, а не утверждённая юридическая политика или согласие на обработку. Используйте только вымышленные данные.</p>
      <h2>Что делает приложение</h2>
      {dataMap.map(([title,text])=><section key={title}><h3>{title}</h3><p>{text}</p></section>)}
      <h2>Что необходимо до публичного запуска</h2>
      <p>Нужно утвердить реального оператора и контакт, назначение сервиса и аудиторию, цели и основания обработки, согласия, обработчиков и страны, сроки хранения и удаления резервных копий, порядок обращений и модерации, условия работы с данными детей. Эти сведения не выдуманы и пока не заменены образцами.</p>
    </>:<>
      <p>Оператор: {config.operatorName}</p>
      <p>Обновлено: <time dateTime={config.privacyUpdatedAt}>{config.privacyUpdatedAt}</time></p>
      <div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{config.privacyText}</div>
      <p>Контакт для обращений: {config.supportContact}</p>
    </>}
  </LegalLayout>;
}

export function SupportView({config}:{config:LegalConfig}){
  return <LegalLayout title="Поддержка">
    {config.demo?<p role="note"><strong>Демонстрационный режим.</strong> Оператор и канал поддержки ещё не утверждены. Эта страница не принимает обращения и не обещает срок ответа. Используйте только вымышленные данные.</p>:<>
      <p>Оператор: {config.operatorName}</p>
      <p>Контакт для обращений: {config.supportContact}</p>
    </>}
    <h2>Безопасное обращение</h2>
    <p>Опишите проблему, версию приложения и устройства, а также шаги воспроизведения. Не отправляйте файл восстановления, секреты доступа, личные данные гостей или снимки экрана с ними. Не публикуйте гостевую ссылку в открытом обращении.</p>
    <h2>Удаление и восстановление</h2>
    <p>Для управления своим списком используйте доступ владельца. Файл восстановления предоставляет полный доступ к спискам; храните его отдельно и не передавайте в поддержку. Не считайте удаление приложения удалением опубликованного серверного списка.</p>
    <p><a href="/privacy">Сведения об обработке данных</a></p>
  </LegalLayout>;
}

export function RulesView({config}:{config:LegalConfig}){
  return <LegalLayout title="Правила пользовательского контента">
    {config.demo?<>
      <p role="note"><strong>Демонстрационный режим.</strong> Правила для публичного сервиса ещё не утверждены. Здесь разрешены только вымышленные данные для тестирования; эта страница не является утверждёнными условиями сервиса.</p>
      <h2>Сообщение о нарушении</h2>
      <p>В открытом гостевом списке есть кнопка «Сообщить о нарушении». Сообщение сохраняется на сервере после подтверждения отправки. Не включайте в него ключи доступа, файл восстановления или персональные данные.</p>
      <p>Регистрация сообщения не означает, что его уже рассмотрели или удалили содержимое. Оператор, порядок рассмотрения и сроки ответа для публичного сервиса ещё не утверждены.</p>
      <h2>Перед публичным запуском</h2>
      <p>Нужно утвердить правила допустимого контента, права на материалы, порядок жалоб, рассмотрения, ограничения доступа и оспаривания решений, а также ответственного оператора и контакт. Демоверсия не подменяет эти решения.</p>
    </>:<>
      <p>Оператор: {config.operatorName}</p>
      <p>Версия от <time dateTime={config.rulesUpdatedAt}>{config.rulesUpdatedAt}</time></p>
      <div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{config.rulesText}</div>
      <p>Контакт для обращений: {config.supportContact}</p>
    </>}
    <p><a href="/support">Поддержка и безопасное обращение</a></p>
  </LegalLayout>;
}
