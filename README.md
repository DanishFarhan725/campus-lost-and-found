# Campus Lost & Found Portal

A full-stack web application that helps university students report, discover, and manage lost and found items on campus.

Users can create listings for lost or found items, search and filter existing reports, view item details, contact the person who posted an item, and mark their own listings as resolved.

## Features

* User registration and authentication
* Secure password hashing with bcrypt
* Session-based authentication
* Create lost and found item listings
* Add item details including:

  * Title
  * Category
  * Location
  * Date
  * Description
  * Optional image
* Search and filter listings
* Filter by item type, category, and status
* View detailed item information
* Contact listing owners by email
* Mark personal listings as resolved
* Delete personal listings
* Personal "My Posts" dashboard
* Responsive design for desktop, tablet, and mobile

## Technology Stack

| Component      | Technology                |
| -------------- | ------------------------- |
| Backend        | Node.js, Express.js       |
| Frontend       | HTML, CSS, JavaScript     |
| Authentication | Express Session, bcryptjs |
| Data Storage   | JSON file-based storage   |
| File Uploads   | Multer                    |
| Deployment     | Render                    |

## Project Structure

```text
lost-and-found/
├── server.js              # Express application entry point
├── db.js                  # JSON-based data layer
├── routes/
│   ├── auth.js            # Authentication routes
│   └── items.js           # Lost and found item routes
├── public/
│   ├── index.html         # Main application interface
│   ├── css/
│   │   └── style.css      # Application styles
│   └── js/
│       └── app.js         # Frontend application logic
├── data/                  # Application data
└── uploads/               # Uploaded item images
```

## Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) v18 or later
* npm

### Installation

Clone the repository:

```bash
git clone https://github.com/DanishFarhan725/campus-lost-and-found.git
cd campus-lost-and-found
```

Install the project dependencies:

```bash
npm install
```

Start the application:

```bash
npm start
```

The application will be available at:

```text
http://localhost:3000
```

## Live Demo

**[Campus Lost & Found — Live Application](https://campus-lost-and-found-t43x.onrender.com/)**

## Application Workflow

```text
User
  │
  ├── Register / Login
  │
  ├── Browse Lost & Found Items
  │
  ├── Search / Filter Listings
  │
  ├── Create a Listing
  │      ├── Lost Item
  │      └── Found Item
  │
  ├── Manage Personal Listings
  │      ├── Resolve
  │      └── Delete
  │
  └── Contact Listing Owner
```

## Data Storage

The application uses a lightweight JSON-based storage layer for users and item listings. This keeps the project simple to set up without requiring a separate database server.

Uploaded item images are handled through Multer and stored by the application.

## Deployment

The application is deployed as a Node.js web service on Render.

**Live:**
https://campus-lost-and-found-t43x.onrender.com/

**Source Code:**
https://github.com/DanishFarhan725/campus-lost-and-found

## License

This project was developed as a university software project.

