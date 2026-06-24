export default (token: string) =>
 Buffer.from(token.replace('Bot ', '').split('.')[0], 'base64').toString();
