const { DynamoDBDocument } = require('@aws-sdk/lib-dynamodb');
const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");

const client = new CloudWatchClient({});

const TABLE_NAME = process.env.TABLE_NAME ?? '';
const PRIMARY_KEY = process.env.PRIMARY_KEY ?? '';

const db = DynamoDBDocument.from(new DynamoDB());

const buildDimensions = (event) => {
    try {
        const shortName = event.pathParameters.id;
        const platform = JSON.parse(event.headers['sec-ch-ua-platform'] ?? '"N/A"');
        const deviceLanguage = event.headers['accept-language']
            .split(',')
            .map(lang => lang.split(';')[0])
            .filter(lang => !lang.includes('-'))
            .slice(-1)[0];
        const browser = JSON.parse(event?.headers['sec-ch-ua']?.split(';')?.[0] ?? '"N/A"');
        return { shortName, platform, deviceLanguage, browser };
    } catch (error) {
        console.error(error);
        return {};
    }
};

const buildDomainDimensions = (dynamoRecord) => {
    try {
        if (!dynamoRecord) return {};
        const url = new URL(dynamoRecord.originalURL);
        return { domain: url.hostname, redirectUrl: dynamoRecord.originalURL };
    } catch (error) {
        console.error(error);
        return {};
    }
}

const addMetric = async (event, dynamoRecord, success) => {
    const rawDimensions = { ...buildDimensions(event), ...buildDomainDimensions(dynamoRecord), success }

    const dimensionsList = Object.keys(rawDimensions).map((key) => ({ Name: key, Value: rawDimensions[key] }));

    const input = {
        Namespace: 'urlShortener',
        MetricData: [{
            MetricName: "RedirectRequest",
            Dimensions: dimensionsList,
            Unit: "Count",
            Value: 1,
            Timestamp: new Date(),
        }]
    }

    const command = new PutMetricDataCommand(input);
    await client.send(command);
}

const handler = async (event) => {
    const requestedItemId = event.pathParameters.id;
    if (!requestedItemId) {
        console.error('Input Validation: Missing Item Id');
        return { statusCode: 400, body: `Error: You are missing the path parameter id` };
    }

    const params = {
        TableName: TABLE_NAME,
        Key: {
            [PRIMARY_KEY]: requestedItemId
        }
    };

    try {
        const response = await db.get(params);
        if (response.Item?.originalURL) {
            await addMetric(event, response.Item, true);
            return {
                statusCode: 302,
                headers: {
                    Location: response.Item.originalURL,
                }
            };
        } else {
            console.error('Item Not Found or with invalid schema');
            await addMetric(event, null, false);
            return { statusCode: 404 };
        }
    } catch (dbError) {
        console.error(dbError);
        return { statusCode: 500, body: JSON.stringify(dbError) };
    }
};

module.exports = { handler };