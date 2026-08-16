CREATE TABLE `routes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`shareToken` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `routes_id` PRIMARY KEY(`id`),
	CONSTRAINT `routes_shareToken_unique` UNIQUE(`shareToken`)
);
--> statement-breakpoint
CREATE TABLE `sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routeId` int NOT NULL,
	`position` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`boxNumber` int NOT NULL,
	CONSTRAINT `sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stops` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sectionId` int NOT NULL,
	`routeId` int NOT NULL,
	`stopOrder` int NOT NULL,
	`propertyType` varchar(64),
	`side` varchar(8),
	`road` varchar(255),
	`houseNumber` varchar(64),
	`eircode` varchar(16),
	`residents` text,
	`aliases` text,
	`searchTags` text,
	`hasDog` boolean DEFAULT false,
	`safePlace` text,
	`notes` text,
	`lat` varchar(32),
	`lng` varchar(32),
	CONSTRAINT `stops_id` PRIMARY KEY(`id`)
);
