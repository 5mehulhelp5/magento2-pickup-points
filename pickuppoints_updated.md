# Innosend Pickup Points API Documentation

## Overview

The Innosend Pickup Points API allows you to retrieve pickup points for supported couriers (e.g., DHL, DPD) based on a given location.

### Base URL (Staging)

```
https://api-staging.innosend.eu/v1/pickup-point
```

## Authentication

You need to authenticate using a Bearer token in the `Authorization` header of your request. A token will be provided for access.

### Authentication Example

Include the Bearer token in the `Authorization` header as shown below:

```
Authorization: Bearer <your_token>
```

## Request Parameters

Pickup points can be retrieved by passing either address information or geographical coordinates. If you pass address information, the expected parameters are:

| Parameter       | Type   | Description                            | Example               |
|-----------------|--------|----------------------------------------|-----------------------|
| `country_code`  | String | 2-letter country code (ISO 3166-1)     | `NL` (Netherlands)    |
| `city`          | String | The city name                          | `Amsterdam`           |
| `street`        | String | The street name                        | `Damrak`              |
| `zip_code`      | String | Postal code                            | `1012`                |
| `couriers[]`    | Array  | List of courier names                  | `['DHL', 'DPD']`      |


If you pass geographical coordinates, the expected parameters are:

| Parameter       | Type   | Description                            | Example               |
|-----------------|--------|----------------------------------------|-----------------------|
| `country_code`  | String | 2-letter country code (ISO 3166-1)     | `NL` (Netherlands)    |
| `longitude`     | String | The longitude                          | `4.89`                |
| `latitude`      | String | The latitude                           | `52.37`               |
| `couriers[]`    | Array  | List of courier names                  | `['DHL', 'DPD']`      |

## Example Request

Here's an example using `curl` or `python` to send a request to the API:

```
curl -X GET "https://api-staging.innosend.eu/v1/pickup-point?country_code=NL&city=Amsterdam&street=Damrak&zip_code=1012&couriers=DHL&couriers=DPD" -H "Authorization: Bearer <token>"
```

```py
import requests

url = "https://api-staging.innosend.eu/v1/pickup-point"
token = "<token>"

params = {
    'country_code': 'NL',
    'city': 'Amsterdam',
    'street': 'Damrak',
    'zip_code': '1012',
    'couriers': ['DHL', 'DPD']
}

headers = {
    'Authorization': f'Bearer {token}'
}

response = requests.get(url, headers=headers, params=params)
print(response.json())
```

## Example Response

A successful response will return a JSON object with the list of pickup points for the specified couriers:

```
[
  {
    "courier": {
      "name": "DHL",
      "images": ["url_to_logo"],
      "service_class": "Pickup"
    },
    "locations": [
      {
        "id": "12345",
        "name": "Pickup Point 1",
        "address": {
          "country_code": "NL",
          "zip_code": "1012",
          "city": "Amsterdam",
          "street_address": "Damrak 123"
        },
        "geo": {
          "latitude": 52.378,
          "longitude": 4.9
        },
        "opening_hours": [
          {
            "day_of_week": 1,
            "opens": "09:00",
            "closes": "18:00"
          }
        ],
        "closure_periods": [
          {
            "from_date": "2024-12-24",
            "to_date": "2024-12-26"
          }
        ]
      }
    ]
  }
]
```

## Get Available Couriers for Pickup Points

**Endpoint:**

```
GET /pickup-point/courier/
```

**Description:** Returns a list of all couriers that can be used for pickup points.

**Request Parameters:** *None.*

**Response:**

```
[
    "DHL",
    "PostNL",
    "UPS"
]
```

**Implementation Details:**

- This endpoint extracts unique courier names from the system and returns them as a JSON list.  
- It does not require any input parameters.  
- The response consists of a set of courier names that correspond to those available for the `/pickup-point/` endpoint.

## Error Responses

### 401 Unauthorized

This error occurs if the token is invalid or missing from the request. Example response:

```
{
  "error": "Token invalid"
}
```

Make sure you are sending the correct Bearer token in the request headers.  
