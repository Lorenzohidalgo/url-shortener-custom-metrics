const { DynamoDBDocument } = require('@aws-sdk/lib-dynamodb');
const { DynamoDB, ConditionalCheckFailedException } = require('@aws-sdk/client-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME ?? '';
const PRIMARY_KEY = process.env.PRIMARY_KEY ?? '';

const db = DynamoDBDocument.from(new DynamoDB());

const RESERVED_RESPONSE = `Error: You're using AWS reserved keywords as attributes`,
    KEY_EXISTS_ERROR = `Error: Key already exists`,
    DYNAMODB_EXECUTION_ERROR = `Error: Execution update, caused a Dynamodb error, please take a look at your CloudWatch Logs.`;

const getErrorMessage = (error) => {
    if (error instanceof ConditionalCheckFailedException) {
        return KEY_EXISTS_ERROR;
    }

    if (error.code === 'ValidationException' && error.message.includes('reserved keyword')) {
        return RESERVED_RESPONSE;
    }

    return DYNAMODB_EXECUTION_ERROR;
};

const getTTL = (ttlInSeconds) => Math.floor((new Date()).getTime() / 1000) + ttlInSeconds;

const getRedirectionURL = ({ path, headers: { Host } }) => JSON.stringify(`https://${Host}${path}`)

const handler = async (event) => {
    const itemId = event.pathParameters.id;

    if (!itemId) {
        console.error('Input Validation: Missing Item Id');
        return { statusCode: 400, body: `Error: You are missing the path parameter id` };
    }

    if (!event.body) {
        console.error('Input Validation: Missing or invalid event Body');
        return { statusCode: 400, body: 'invalid request, you are missing the parameter body' };
    }

    const item = typeof event.body == 'object' ? event.body : JSON.parse(event.body);

    const redirectItem = {
        ...item,
        [PRIMARY_KEY]: itemId,
        ttl: getTTL(item.ttlInSeconds)
    }

    const params = {
        TableName: TABLE_NAME,
        Item: redirectItem,
        ConditionExpression: "attribute_not_exists(#id)",
        ExpressionAttributeNames: {
            "#id": PRIMARY_KEY,
        },
    };

    try {
        await db.put(params);
        return { statusCode: 201, body: getRedirectionURL(event) };
    } catch (dbError) {
        console.error(dbError);
        return { statusCode: 500, body: getErrorMessage(dbError) };
    }
};

module.exports = { handler };