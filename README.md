# URI-coiner

This page takes a date + transcription of an author's name and book title
and builds a URI based on this; then checks whether this URI already exists in the corpus. 

Use the Python script to generate the uri_data.json file, which has this structure:

```
{
    "records": [
        {
            "uri": <author_uri>,
            ...,
            "books": [
                <book_uri>: {}
            ]
        }
    ],
    "year_index": {
        <year>: <list_of_record_indices>
    },
    "token_weights": {
        <token>: <weight>
    }
}
```

TO DO:
- improve layout
- turn characters in the conversion table into clickable keys that send the characters to the active input field