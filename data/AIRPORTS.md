# Airport data

`airports.json` contains a selected catalogue of 60 Indian airport cities, IATA codes and coordinates for great-circle estimates. It is not a live route or operating-schedule feed. Name/code/coordinate changes should be verified before publishing a dataset update.

The Goa entry represents **GOI, Dabolim**, rather than Manohar/Mopa (GOX). The prior combined name and Mopa alias were removed because those are distinct airports. See the [Airports Authority of India Goa listing](https://www.aai.aero/airports/contact-us/goa) and [official aeronautical information for Manohar](https://aim-india.aai.aero/eaip/eaip-v2-01-2026/eAIP/IN-AD%202.1VOGA-en-GB.html).

The gateway mapping in `utils/flightEngine.js` offers common alternatives for places missing from this selected dataset; it does not establish that the suggested airport is the geographically closest or that the city has no airport. Route inventory must come from an airline supplier.
