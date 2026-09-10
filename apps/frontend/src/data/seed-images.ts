/**
 * Seed imagery for events, artists, venues and restaurants.
 *
 * Generated from apps/frontend/public/media/manifest.json — edit that record
 * (and re-generate) rather than hand-editing paths here.
 *
 * Every image is free for commercial use with no attribution required
 * (Pexels License / Unsplash License). `credit` is kept so the licence stays
 * provable; it does not need to be rendered.
 *
 * Files are served straight from `public/`, so `path` is a root-relative URL
 * usable as-is in `<img src>`.
 */

export interface SeedImage {
  /** Root-relative URL, e.g. `/media/artists/bansuri-flautist.jpg`. */
  path: string;
  /** Real description of the photo, for `alt`. Never a filename restatement. */
  alt: string;
  /** Tiny base64 JPEG data URI (~20px wide) for blur-up while the real image loads. */
  blur?: string;
  /** Provenance line, e.g. `Photo by X on Pexels (Pexels License)`. */
  credit: string;
}

export const eventImages: SeedImage[] = [
  {
    path: "/media/events/acoustic-band-bar-night.jpg",
    alt: "A three-piece acoustic band playing to a close crowd in a low-lit neighbourhood bar",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAMBAgQF/8QAIBAAAgICAgIDAAAAAAAAAAAAAQMCEQAhBBIFIjFRYf/EABYBAQEBAAAAAAAAAAAAAAAAAAIBA//EABwRAAIBBQEAAAAAAAAAAAAAAAABIQIDERJRQf/aAAwDAQACEQMRAD8A4fFYtVTDOsro1kc5wZEERJYT7SJ2cTBMRqz95ZtQogAn93hVuNjR1+I2q8jyorES3rWqkReGLT0asTMKJ+awy4XQTw//2Q==",
    credit: "Photo by Leonardo DelSabio on Pexels (Pexels License)",
  },
  {
    path: "/media/events/acoustic-set-rustic-venue.jpg",
    alt: "A guitarist performing a solo acoustic set in a small rustic venue washed in warm amber light",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAMFBP/EACAQAAICAgICAwAAAAAAAAAAAAECAAMEERMxEiFBUWH/xAAVAQEBAAAAAAAAAAAAAAAAAAADAf/EABoRAAICAwAAAAAAAAAAAAAAAAABAhESIVH/2gAMAwEAAhEDEQA/AJaWICV78BtvyPsw8O2uuw5QRmB2v1JC2upfhHzsmaeJ7wGTXXW9wsd2O+CB6LAehKOIpGMmmMIRIt2SaP/Z",
    credit: "Photo by Leonardo DelSabio on Pexels (Pexels License)",
  },
  {
    path: "/media/events/audience-silhouettes-colour.jpg",
    alt: "Silhouetted audience members against the coloured stage lights of a live show",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAQCAwX/xAAkEAACAQMDAwUAAAAAAAAAAAABAgMABBESIUEFExUiMTKRwf/EABYBAQEBAAAAAAAAAAAAAAAAAAMCBP/EABgRAQEBAQEAAAAAAAAAAAAAAAIBAAQS/9oADAMBAAIRAxEAPwDFjhtioPZPrzp3zxsPumpLW0jleNmXCsA2lclaQHUZI4UVEUdskjn3qleozRzSSqF1SfLIzmt3RSVJM5RkzdxHaxylViDgc4I/aKh5eWFI0EULYUbsuTRQehqqG//Z",
    credit: "Photo by Caleb Oquendo on Pexels (Pexels License)",
  },
  {
    path: "/media/events/band-cozy-bar-ambiance.jpg",
    alt: "A live band playing in the corner of a cosy bar as guests listen from nearby tables",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAYBAwQF/8QAHxAAAQQCAgMAAAAAAAAAAAAAAQACAxESIRMiBVFx/8QAFQEBAQAAAAAAAAAAAAAAAAAAAgH/xAAZEQEBAAMBAAAAAAAAAAAAAAABABESMVH/2gAMAwEAAhEDEQA/AOBBg+BzppC14PUVd/VXFjyAuIon0s3IXEXtRnWkXL2YhyZ4n+OEbQWtut7Ql9knUW0FCOh7Xa//2Q==",
    credit: "Photo by cottonbro studio on Pexels (Pexels License)",
  },
  {
    path: "/media/events/band-on-stage-energetic.jpg",
    alt: "An energetic live band playing together on a small stage",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUABADASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAIBAwQG/8QAIRAAAgICAgEFAAAAAAAAAAAAAQIDEQAhBBIxBSJCcYH/xAAVAQEBAAAAAAAAAAAAAAAAAAACAf/EABsRAAIBBQAAAAAAAAAAAAAAAAABIQIRMYHB/9oADAMBAAIRAxEAPwDk0iBVdWWOt408Cxt7DZ80Pj+5d6fGWkBoELusbk8KaNjJ3Vr394ZuOEiOI7Qq3Q1dDNPMcsIwfFYYY3wlOdn/2Q==",
    credit: "Photo by Chris S on Pexels (Pexels License)",
  },
  {
    path: "/media/events/cafe-acoustic-performance.jpg",
    alt: "A woman playing an acoustic guitar during a live performance in a warmly lit cafe",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAABQAEBv/EACEQAAEEAgEFAQAAAAAAAAAAAAEAAgMRBCEiEhMxQVFh/8QAFgEBAQEAAAAAAAAAAAAAAAAAAwEC/8QAGREAAgMBAAAAAAAAAAAAAAAAAAIBITED/9oADAMBAAIRAxEAPwDk3aqgNpfCx2iHl5KxHtdLGyEfpASuHcsbjEHOaDQv4iaaFWLAiNi9+0picWODSQLUpR8Nc9P/2Q==",
    credit: "Photo by Tuti Isnawati on Pexels (Pexels License)",
  },
  {
    path: "/media/events/classical-dancer-stage.jpg",
    alt: "A Bharatanatyam dancer in traditional costume holding a pose under a warm spotlight in a darkened temple hall",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAIDAQb/xAAcEAACAwADAQAAAAAAAAAAAAAAAQIDEQQSMYH/xAAWAQEBAQAAAAAAAAAAAAAAAAADAQL/xAAYEQADAQEAAAAAAAAAAAAAAAAAARESIf/aAAwDAQACEQMRAD8A41LTerK8Xqptz8SE3G8JTU5S9NcJexHuprjLFHPrAAm3R0lk/9k=",
    credit: "Photo by Shuvra Podder on Pexels (Pexels License)",
  },
  {
    path: "/media/events/crowd-under-stage-lights.jpg",
    alt: "A packed night-time crowd facing a stage lit with deep colour wash lighting",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAPABQDASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAQCAwb/xAAeEAACAgIDAQEAAAAAAAAAAAABAgARAyEFEmExUf/EABQBAQAAAAAAAAAAAAAAAAAAAAL/xAAYEQEBAQEBAAAAAAAAAAAAAAABABESMf/aAAwDAQACEQMRAD8AyuJCy666/RJdq11Q15BMGXa3Xly9ONyu4QEBro38ETyBE6fJPIbbQA8EI9k4nLjcqXWxCHSWN//Z",
    credit: "Photo by Fotios Photos on Pexels (Pexels License)",
  },
  {
    path: "/media/events/harmonium-tabla-ensemble.jpg",
    alt: "Three musicians seated on a low white platform playing tabla and harmoniums together at an indoor recital",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAQFAQL/xAAgEAADAAIBBAMAAAAAAAAAAAABAgMABBESEyFxFCJR/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAEC/8QAGBEBAAMBAAAAAAAAAAAAAAAAAAERIUH/2gAMAwEAAhEDEQA/AL+7bWiKtQj7ABfZxP5+urUXyWnx1DxnDtOyKKSBHH7ik5653Jz7Hmg4LdZzNFxxaXZUqCEPB9YZqTnNQqzHGGXDX//Z",
    credit: "Photo by World Sikh Organization of Canada on Pexels (Pexels License)",
  },
  {
    path: "/media/events/indian-classical-spotlight.jpg",
    alt: "An Indian classical musician performing alone in a single warm spotlight on a darkened stage",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAMFAQL/xAAeEAACAgICAwAAAAAAAAAAAAABAgARAwQFEjFRcf/EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AgcIiO20Mgu8LKPpkwiiRH62w2FWCGiYhjbE+4HYPUWAJpQFQ3i4QkH//2Q==",
    credit: "Photo by Vdivision on Pexels (Pexels License)",
  },
  {
    path: "/media/events/jazz-band-club-stage.jpg",
    alt: "A jazz band mid-set on a small club stage with a vocalist, pianist and saxophonist",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAQDBv/EACAQAAICAQMFAAAAAAAAAAAAAAECAAMRBCExEjJRUmH/xAAWAQEBAQAAAAAAAAAAAAAAAAABAgP/xAAVEQEBAAAAAAAAAAAAAAAAAAAAAf/aAAwDAQACEQMRAD8A5amwInYhz7CUaelb3AfoQHxIczaoh7ApHP2RY0lLqglrKpyAdohjvxEQ/9k=",
    credit: "Photo by cottonbro studio on Pexels (Pexels License)",
  },
  {
    path: "/media/events/jazz-duo-guitar-piano.jpg",
    alt: "Two jazz musicians performing together on guitar and piano in a small room",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAQCAwX/xAAfEAACAgICAwEAAAAAAAAAAAABAgADBBESIRMiUTL/xAAVAQEBAAAAAAAAAAAAAAAAAAABAP/EABYRAQEBAAAAAAAAAAAAAAAAAAABEf/aAAwDAQACEQMRAD8AwsXGfKsbiPVRtiToCTbCeq8UtoMRvZMpry2xwAigg99/Y3Zn+f2uqVnK/oHRhbhhW0Cpgr6PWwR8hF7GNjcmJJMJaH//2Q==",
    credit: "Photo by Anthony Shkraba on Pexels (Pexels License)",
  },
  {
    path: "/media/events/jazz-quartet-dim-club.jpg",
    alt: "A jazz quartet performing under dim red house lights in an intimate club",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUDBP/EAB8QAAICAgIDAQAAAAAAAAAAAAECAAMRIQQSMUFRkf/EABUBAQEAAAAAAAAAAAAAAAAAAAEC/8QAGREAAwEBAQAAAAAAAAAAAAAAAAECERIh/9oADAMBAAIRAxEAPwCLVatvGdrLSrqdDzMKCqupsfKk/JzIRjx73Ac9goAG4PW/S5yViLrjh2HtWMLj1Em12ArpAP2IKA7P/9k=",
    credit: "Photo by cottonbro studio on Pexels (Pexels License)",
  },
  {
    path: "/media/events/listening-over-a-drink.jpg",
    alt: "A guest nursing a drink at a table while a band plays in the background of a dim venue",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAUBAgMG/8QAHhABAAIBBAMAAAAAAAAAAAAAAQACAwQRMWESUXH/xAAVAQEBAAAAAAAAAAAAAAAAAAACAf/EABkRAQEAAwEAAAAAAAAAAAAAAAEAERITIf/aAAwDAQACEQMRAD8A5fBZcoXXw6k22cill7mFLI+yXXlPkj6yMBNtNq8OPCVsqwikvscQg5k9m//Z",
    credit: "Photo by cottonbro studio on Pexels (Pexels License)",
  },
  {
    path: "/media/events/music-cafe-guitarist.jpg",
    alt: "A guitarist playing in a music-themed cafe with soft lamps and record covers on the wall",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAQDBQb/xAAiEAACAgIBAwUAAAAAAAAAAAABAgADBCEREhMUMVFxkaH/xAAWAQEBAQAAAAAAAAAAAAAAAAAEAgP/xAAZEQADAQEBAAAAAAAAAAAAAAAAAQIRITH/2gAMAwEAAhEDEQA/AM3hVV2qVZiD7gfksMCrwbVyHKWEghV5GohjY57hK2FfgRu2kohuDDkEa6dQ7vK4xCh54I5F9BuYhAd+u4SNq0J54P3CaLCHL0//2Q==",
    credit: "Photo by Tuti Isnawati on Pexels (Pexels License)",
  },
  {
    path: "/media/events/singer-guitarist-indoor-gig.jpg",
    alt: "A singer-guitarist performing into a microphone at a small indoor gig",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAQFAv/EACEQAAEEAQMFAAAAAAAAAAAAAAEAAgMRBBMhMQUSFCJR/8QAFgEBAQEAAAAAAAAAAAAAAAAAAwAB/8QAFxEBAQEBAAAAAAAAAAAAAAAAAQARMf/aAAwDAQACEQMRAD8AidLEImGoGuA5DjQO6em8cNyLiZ7EadHZv2lDxpjG4mg6xwUxPkvd2WBvysMlcQkZgBIaQsvNuJQqN7f/2Q==",
    credit: "Photo by Suki Lee on Pexels (Pexels License)",
  },
];

export const artistImages: SeedImage[] = [
  {
    path: "/media/artists/bansuri-flautist.jpg",
    alt: "A flautist in traditional dress playing the bansuri with his eyes closed",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAUCBAb/xAAfEAACAQMFAQAAAAAAAAAAAAABAgMABBEFEhMhMUH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AQ2mk86ySOxVR0uPppdNE0LlGHYNaXT5N8IZCdgc5UfaX64AtxGeMJlfBQU7a6mtmJhcrn2ozzy3LBpnLEeZoooP/2Q==",
    credit: "Photo by Nikhil Manan on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/drummer-brick-wall.jpg",
    alt: "A smiling drummer in glasses seated at his kit against an exposed brick wall",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAIEAwX/xAAgEAACAgICAgMAAAAAAAAAAAABAgARAwQSMRMhMkFR/8QAFgEBAQEAAAAAAAAAAAAAAAAABAAB/8QAGBEBAQEBAQAAAAAAAAAAAAAAAQAREmH/2gAMAwEAAhEDEQA/AOo22mwpKMpo/RuRuMzbOIg1io3MPIoxYzwAarsepZpvy12ciyw/eoNcNZnhOGIHyqERsBsEMACOqhN5rov/2Q==",
    credit: "Photo by Anthony Shkraba on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/drummer-live-portrait.jpg",
    alt: "A drummer caught mid-strike behind his cymbals during a live set",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAMEBQb/xAAgEAABBAICAwEAAAAAAAAAAAABAAIDBBEhEzEFEkFh/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwL/xAAaEQACAwEBAAAAAAAAAAAAAAAAAQISIREx/9oADAMBAAIRAxEAPwDkmRuldhu8FMscYkxnr8VVenO/ka2NwaSQfm0mzRnEzgYyCPiSuAqa7rNu9ZfUqyNhwBzHvajl83c9WAmM67LBlCFUvAopWP/Z",
    credit: "Photo by Caleb Oquendo on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/guitarist-stage-light.jpg",
    alt: "A guitarist playing an acoustic guitar under a narrow beam of stage light",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAQBAgMF/8QAIBAAAgICAgIDAAAAAAAAAAAAAQIAAwQREyESMTJSkf/EABUBAQEAAAAAAAAAAAAAAAAAAAEC/8QAGREAAwADAAAAAAAAAAAAAAAAAAECESFB/9oADAMBAAIRAxEAPwBTKVrrCeVWJH29zl5aeL6KBTr1KJY99wqJ0Hb8mmYOHIeokuEHRMYpt7C4XBE9GEgvs/EQlBg//9k=",
    credit: "Photo by A. Darmel on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/keys-vocalist-saree.jpg",
    alt: "A woman in a saree singing at a microphone while playing a stage keyboard",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAEDBAb/xAAeEAACAgICAwAAAAAAAAAAAAABEQACAwQSMSEiQf/EABUBAQEAAAAAAAAAAAAAAAAAAAAB/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEB/9oADAMBAAIRAxEAPwDMa4NSj9Me5jNMrbqelJta1b1PoAQOxDOjSrEXVyVSpi5htQiJ4lDwIQV//9k=",
    credit: "Photo by Rajesh Syangtan on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/saxophonist-warm-light.jpg",
    alt: "A young saxophonist playing under warm stage lights",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAMEBv/EACIQAAIBBAIBBQAAAAAAAAAAAAECAwAEERMFEjEhIkFRYf/EABUBAQEAAAAAAAAAAAAAAAAAAAME/8QAGBEBAQEBAQAAAAAAAAAAAAAAAREAAhL/2gAMAwEAAhEDEQA/AM8vFXGgXBjOrOM02FWt5VDx5Xp5xnBqpeTmNrHbnBjPqRTrSXStzKyLJ7lXq3jFDVY5ZC6OPhZLldwkVQxOB1/aK0UUo1L0QIv0Piiqjg03p3//2Q==",
    credit: "Photo by Yan Krukov on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/singer-songwriter-glasses.jpg",
    alt: "A singer-songwriter in glasses performing with an acoustic guitar on a small stage",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA8DASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAIDBAb/xAAgEAEBAAIBBAMBAAAAAAAAAAABAgADEgQRITETQVFh/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAH/xAAWEQEBAQAAAAAAAAAAAAAAAAAAESH/2gAMAwEAAhEDEQA/AOa065uwuiT9xGeyj9Zt0dI7dRc08+Xr+YvUF8B2VK1Sji6sxD5KI4ng75Nuq8KoesMMD//Z",
    credit: "Photo by John Detochka on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/sitar-player-stage.jpg",
    alt: "A sitarist's hands moving across the frets mid-performance, with tabla and stage microphones set up alongside",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGgAAAQUBAAAAAAAAAAAAAAAAAAECAwQFBv/EAB8QAAICAwACAwAAAAAAAAAAAAECAwQAERIhYQUxUf/EABYBAQEBAAAAAAAAAAAAAAAAAAIAAf/EABcRAQEBAQAAAAAAAAAAAAAAAAABESH/2gAMAwEAAhEDEQA/AK1SSkskrimvOzoMdgesgcRrt41SPfleR95r/H14LF61XaIAISOt+d/uc7chKTMxkZuTyMFh7CMELHokH1hjFc6wzOp//9k=",
    credit: "Photo by Saubhagya gandharv on Unsplash (Unsplash License)",
  },
  {
    path: "/media/artists/tabla-hands-monochrome.jpg",
    alt: "A monochrome portrait of a musician's hands striking the tabla mid-phrase",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAQBAwX/xAAgEAACAgIBBQEAAAAAAAAAAAABAgADBBEhBRIiUXEx/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AEca5VRbUqc1MoX4Yj1JXvyBZWhH6vMnJyrcVRVW3jwfkTXIfuBOzrR0TA1cehUoQBiTrnXuEqruZkBXxHoGED//2Q==",
    credit: "Photo by Yash Limaje on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/tabla-player-outdoors.jpg",
    alt: "An elderly man in a white shirt playing tabla outdoors",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAQGAgX/xAAhEAACAQQCAgMAAAAAAAAAAAABAgMABBEhBRITIjFBcf/EABUBAQEAAAAAAAAAAAAAAAAAAAAC/8QAGREBAQADAQAAAAAAAAAAAAAAAQACAxEh/9oADAMBAAIRAxEAPwCgvZY7a3zI3XscA4qS5GS4tLplEzAP7DqcDddxPDfIsPlLSIQzfY/KX5TixeXCupIAXGiKPeV6kxfZKe6kiyYz1PsMjXwKzcTTGOFzM+WXe6KKFLf/2Q==",
    credit: "Photo by Kunal Deotare on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/tanpura-vocalist.jpg",
    alt: "A smiling woman in traditional dress holding a tanpura upright at her shoulder",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAMFAQT/xAAhEAACAQMEAwEAAAAAAAAAAAABAgMABBESITFBBVFxQv/EABYBAQEBAAAAAAAAAAAAAAAAAAABAv/EABkRAAIDAQAAAAAAAAAAAAAAAAABAhIhMf/aAAwDAQACEQMRAD8ARfgJbBVG+eB3U2G6ihCqA2rV8x7pnlHaK8xktxz8rgmYPKHChc9CkY7pW8Kpkt85OsZ9UVttcxpAqvbpIR+id6KVZnp//9k=",
    credit: "Photo by Sohani Kamat on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/veena-player-portrait.jpg",
    alt: "A woman in traditional South Indian dress seated with a veena across her lap",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAABAACBf/EACAQAAEDAwUBAAAAAAAAAAAAAAEAAgMEERMhIjEyUZH/xAAWAQEBAQAAAAAAAAAAAAAAAAADAAT/xAAZEQEBAQADAAAAAAAAAAAAAAABABEhIkH/2gAMAwEAAhEDEQA/AOfDA0RAm1kWqgGTQJ1HKJNsbMjm9m8I1VKTMbsLT54gHnLcpk8Px9GtF+TZYllcSNB8UpCHevL/2Q==",
    credit: "Photo by TK Dhamu on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/violinist-close-portrait.jpg",
    alt: "A close portrait of a woman resting her chin near the scroll of her violin",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAMEBf/EAB4QAAEEAwEBAQAAAAAAAAAAAAEAAgMEERIhMQVh/8QAFgEBAQEAAAAAAAAAAAAAAAAAAwIE/8QAGREAAgMBAAAAAAAAAAAAAAAAAAECAzFB/9oADAMBAAIRAxEAPwBDK0VqAHJ31yNR4s18eD0dTK1swVnzB2CWlvP1Si7GWjYkHHeIq+mi5JNFf3KMVKCIQl+HHBBOVhH1CFccDs0//9k=",
    credit: "Photo by Daniel Dolidze on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/violinist-studio-portrait.jpg",
    alt: "A young violinist holding his instrument against a dark studio backdrop",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA4DASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAMCBAX/xAAgEAEBAAIBAwUAAAAAAAAAAAABAgADEQQhURITMTJB/8QAFAEBAAAAAAAAAAAAAAAAAAAAAf/EABURAQEAAAAAAAAAAAAAAAAAAABB/9oADAMBAAIRAxEAPwDB0dLqsr3NhrCVFPl8ZVqAxmy2pDvwPfF9VcrJH1DgwpiLSRR5xeyn0yc/mGGIf//Z",
    credit: "Photo by Vital Silva on Pexels (Pexels License)",
  },
  {
    path: "/media/artists/vocalist-vintage-mic.jpg",
    alt: "A vocalist singing into a vintage ribbon microphone, eyes closed mid-phrase",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAQBAgMG/8QAHRAAAgICAwEAAAAAAAAAAAAAAQIAEQMxEiFBcf/EABYBAQEBAAAAAAAAAAAAAAAAAAMAAf/EABgRAQEBAQEAAAAAAAAAAAAAAAEAAhEh/9oADAMBAAIRAxEAPwDl0XkjsQaA2JK9VcsjFcS14b+zF2JYky77K4DIza56G4RMXUJsd//Z",
    credit: "Photo by Anthony Shkraba on Pexels (Pexels License)",
  },
];

export const venueImages: SeedImage[] = [
  {
    path: "/media/venues/bar-stage-microphone.jpg",
    alt: "A microphone stand set up beside a wooden bar counter lined with shelves and bottles",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAEEAgP/xAAgEAACAgEDBQAAAAAAAAAAAAABAgARAwQSIRQiMUFR/8QAFgEBAQEAAAAAAAAAAAAAAAAAAQME/8QAGBEAAwEBAAAAAAAAAAAAAAAAAAECEkH/2gAMAwEAAhEDEQA/AGuTVJiUKFJrkkGa6nUjU41GMHER3NfiWolqeZOEYjaGAr3tmSVT4XbSEVdSQ2UtZvkQnYYbAJazXyEcUG5P/9k=",
    credit: "Photo by Markus Winkler on Pexels (Pexels License)",
  },
  {
    path: "/media/venues/brick-bar-stools.jpg",
    alt: "Tall wooden stools along a brick-fronted bar counter in an empty venue",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAIDBAX/xAAiEAACAgEDBAMAAAAAAAAAAAABAgARAwQSQQUhMWETcbH/xAAVAQEBAAAAAAAAAAAAAAAAAAACA//EABURAQEAAAAAAAAAAAAAAAAAAAAB/9oADAMBAAIRAxEAPwDPTL8ZxsqbgqHex836kmm02s1WMsWAAPYMar6g/Tje0UbPYHmMiZsKgBHF+75kqpF1GLNR48Rcbkg3wx/YQiox/9k=",
    credit: "Photo by Pavel Danilyuk on Pexels (Pexels License)",
  },
  {
    path: "/media/venues/curtained-stage-mic.jpg",
    alt: "A single microphone in a spotlight in front of closed red stage curtains",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAIGBf/EACAQAAIBBAEFAAAAAAAAAAAAAAECAAMEERIGMUFRYXH/xAAWAQEBAQAAAAAAAAAAAAAAAAACAwT/xAAVEQEBAAAAAAAAAAAAAAAAAAAAAf/aAAwDAQACEQMRAD8AkggOvyDLqcCNq2g0Uk+hGc5YnHWBpkih4xWdywcggeRMC9rPWuXdzlix7QhFUn//2Q==",
    credit: "Photo by Martin de Arriba on Pexels (Pexels License)",
  },
  {
    path: "/media/venues/drum-kit-empty-stage.jpg",
    alt: "A drum kit standing alone on a darkened stage, backlit by warm golden haze before the band comes on",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAUGAv/EACAQAAEDBAIDAAAAAAAAAAAAAAEAAgMEERIhQVEiUpH/xAAVAQEBAAAAAAAAAAAAAAAAAAADBP/EABsRAAEFAQEAAAAAAAAAAAAAAAABAgMTIRFR/9oADAMBAAIRAxEAPwBHS2jIe4EN50nkE1HNHdjXEjW+1JmpfhhwtQ1DmNLR3dTui7pSkiJhSSxszPiPqFPGtm9kIaHeiWtP/9k=",
    credit: "Photo by Gigxels com on Pexels (Pexels License)",
  },
  {
    path: "/media/venues/empty-stage-purple-wash.jpg",
    alt: "An empty stage lit by purple spotlights before doors open",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAECAwb/xAAbEAEBAQEAAwEAAAAAAAAAAAABAgARISJhcf/EABUBAQEAAAAAAAAAAAAAAAAAAAAC/8QAFxEBAQEBAAAAAAAAAAAAAAAAABEBAv/aAAwDAQACEQMRAD8AyeNZMtT4lfvNBOOreYHN1D60n45VTT2lXGNNH//Z",
    credit: "Photo by Isabella Mendes on Pexels (Pexels License)",
  },
  {
    path: "/media/venues/empty-stage-red-spots.jpg",
    alt: "Three red spotlights trained on a bare, darkened stage",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAEDBv/EABwQAAICAgMAAAAAAAAAAAAAAAACAREDITJRsf/EABYBAQEBAAAAAAAAAAAAAAAAAAIAAf/EABkRAQEBAAMAAAAAAAAAAAAAAAERAAISUf/aAAwDAQACEQMRAD8AyoF8SK+Jtb7IytTQBrM3ggPuaZGTjNCZ2abnwAKbOzJd/9k=",
    credit: "Photo by Isabella Mendes on Pexels (Pexels License)",
  },
  {
    path: "/media/venues/four-chairs-blue-stage.jpg",
    alt: "Four empty chairs arranged on a dark stage under low blue light for an acoustic set",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUABIDASIAAhEBAxEB/8QAGAABAQEBAQAAAAAAAAAAAAAAAAMBAgb/xAAgEAACAQQBBQAAAAAAAAAAAAAAAQIREiFRAyIxMmGR/8QAGAEAAwEBAAAAAAAAAAAAAAAAAQIEAAP/xAAYEQEBAQEBAAAAAAAAAAAAAAAAARECEv/aAAwDAQACEQMRAD8A8tSptj0xx5qXSxllPHHqaS1C16BXp9gbxG1aPHCLxFHVsaeK7AFkkjmyi0vgABgv/9k=",
    credit: "Photo by Gaby Barragan on Pexels (Pexels License)",
  },
  {
    path: "/media/venues/grand-piano-hall.jpg",
    alt: "A grand piano standing alone on a dimly lit concert hall stage",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAEDBv/EAB0QAAIDAAIDAAAAAAAAAAAAAAEDAAIREjEhYXH/xAAUAQEAAAAAAAAAAAAAAAAAAAAB/8QAFREBAQAAAAAAAAAAAAAAAAAAACH/2gAMAwEAAhEDEQA/AOQUljji6mx9RZN6kgjyO8MqnsSdXY1+RV7K7xtm9wpjKJSSTp7iIf/Z",
    credit: "Photo by Matteo Basile on Pexels (Pexels License)",
  },
  {
    path: "/media/venues/industrial-black-box.jpg",
    alt: "An industrial black-box performance space lit green, with bench seating along the walls",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAQDBv/EACAQAQACAgIBBQAAAAAAAAAAAAEAAgMRBCEFEhMxUWH/xAAVAQEBAAAAAAAAAAAAAAAAAAAAAv/EABgRAQADAQAAAAAAAAAAAAAAAAABERJh/9oADAMBAAIRAxEAPwDlMeVoPtgP3ruLVtd3eyr3Led444gayN9/mpJjRdJ8xq0dhj6Ilrxa27LJEWaf/9k=",
    credit: "Photo by Zisan Ozdemir on Pexels (Pexels License)",
  },
  {
    path: "/media/venues/mic-in-light-beam.jpg",
    alt: "A microphone on a stand standing alone in a shaft of stage light",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABAAG/8QAHhAAAgMAAgMBAAAAAAAAAAAAAQMAAgQREgUjMUH/xAAVAQEBAAAAAAAAAAAAAAAAAAAAA//EABkRAQACAwAAAAAAAAAAAAAAAAABAhESIf/aAAwDAQACEQMRAD8AzmdDNDQtVe1j8ETp8Y/KPaODCqbdVxehIsP0RDt7314ZbtK11x0gSUjKTH//2Q==",
    credit: "Photo by Vadim Koza on Pexels (Pexels License)",
  },
  {
    path: "/media/venues/rooftop-bar-city-view.jpg",
    alt: "A warm, dimly lit rooftop bar with guests seated against a city skyline",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAIEAwX/xAAgEAACAgIBBQEAAAAAAAAAAAABAgADESESBAUjMUFx/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAL/xAAZEQEAAgMAAAAAAAAAAAAAAAAAARESIUH/2gAMAwEAAhEDEQA/AOCaunLny6LHGRnUTuFVIsdq3BGsfP2RIxB0YznK5PuT1cRppYtYc8X18hJ2Y8oRRlT/2Q==",
    credit: "Photo by Jay Moon on Pexels (Pexels License)",
  },
  {
    path: "/media/venues/theatre-seats-lit-stage.jpg",
    alt: "Rows of empty red seats facing an illuminated stage in a small theatre",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAANABQDASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAcBAwb/xAAfEAABAwQDAQAAAAAAAAAAAAABAAIDBAURkiExNBL/xAAWAQEBAQAAAAAAAAAAAAAAAAADAQL/xAAbEQACAgMBAAAAAAAAAAAAAAAAARETAiEiUf/aAAwDAQACEQMRAD8AyrWuJ4BwpLH46KY8Fuo8ACmi1Cvkt1GB5otAhWcqR+VoVvzjscoTClt1GX+aLVCzcvC1n//Z",
    credit: "Photo by Samlin on Pexels (Pexels License)",
  },
];

export const restaurantImages: SeedImage[] = [
  {
    path: "/media/restaurants/art-filled-coffee-house.jpg",
    alt: "An intimate coffee house with framed art covering the walls and modern lighting",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAUCAwQG/8QAHhABAAIDAAIDAAAAAAAAAAAAAQIDAAQRBRIUIUH/xAAUAQEAAAAAAAAAAAAAAAAAAAAC/8QAFhEBAQEAAAAAAAAAAAAAAAAAAQAC/9oADAMBAAIRAxEAPwBLZUEIMDj3Iype+0hF/Ay23bh6jFX7xj4nYsthZL48ZnQOy5zBkWS3OCqDm/V2LKa0reC4YY2Jf//Z",
    credit: "Photo by Catherine Chechun on Pexels (Pexels License)",
  },
  {
    path: "/media/restaurants/bengaluru-modern-dining.jpg",
    alt: "A modern restaurant interior in Bengaluru with sculpted lighting and upholstered seating",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA4DASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAMEAv/EACEQAAICAgEEAwAAAAAAAAAAAAECAAMRIRIEFTFBMoGx/8QAFgEBAQEAAAAAAAAAAAAAAAAAAwAC/8QAFhEBAQEAAAAAAAAAAAAAAAAAABEB/9oADAMBAAIRAxEAPwB9lLmw2qqsufiDIbiorBIOz59R3c667SrLhtBpH1HXrwCqmd+fUClmp3r5oCzNnf7MCpWPFhkD6hCaT//Z",
    credit: "Photo by Prajwal on Pexels (Pexels License)",
  },
  {
    path: "/media/restaurants/bengaluru-mosaic-cafe.jpg",
    alt: "A Bengaluru cafe courtyard with blue mosaic tiling and decorative plates on the wall",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA8DASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAQFAgP/xAAiEAACAgIBAwUAAAAAAAAAAAABAgADERJBBAUhIzEyUcH/xAAVAQEBAAAAAAAAAAAAAAAAAAABAv/EABYRAQEBAAAAAAAAAAAAAAAAAAABEf/aAAwDAQACEQMRAD8AfupW1SpfXIx45mrLSwWmgZIHnXiK23+oFFLEMcbFvyduhSxbb9K2Qn4ngwwpHarbL8va7O32TL/Tsce8IS4iv//Z",
    credit: "Photo by Raaj Ugar on Pexels (Pexels License)",
  },
  {
    path: "/media/restaurants/delhi-cafe-pendants.jpg",
    alt: "Wooden chairs and tables under low pendant lamps in a cosy New Delhi cafe",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA8DASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAwQA/8QAIRAAAgIBAgcAAAAAAAAAAAAAAQIAAxEhQRMUIjFCYaH/xAAWAQEBAQAAAAAAAAAAAAAAAAACAAH/xAAWEQEBAQAAAAAAAAAAAAAAAAAAEQH/2gAMAwEAAhEDEQA/AJbE4IHkPsnuvsUAqN8amLzq22dahSewzDsdLEODkhs4g2UssQNqx9GIBisEbmaaTX//2Q==",
    credit: "Photo by Vidit Goel on Pexels (Pexels License)",
  },
  {
    path: "/media/restaurants/goa-garden-restaurant.jpg",
    alt: "A rustic open-air restaurant in Goa with wooden tables set among dense greenery",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA8DASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAIGAQT/xAAgEAACAgICAgMAAAAAAAAAAAABAgADESESMQQTMlGx/8QAFwEAAwEAAAAAAAAAAAAAAAAAAAIDBP/EABgRAQEAAwAAAAAAAAAAAAAAAAABAzFR/9oADAMBAAIRAxEAPwCbNaeoYLc87B6xE4OoByP2Uymj2E2on38Zy3U12MRUqsTvAEyzJeLNuvsqvLK52Do9RLHJ8F7OnLDY1CED3T//2Q==",
    credit: "Photo by Abey Saksham on Pexels (Pexels License)",
  },
  {
    path: "/media/restaurants/hyderabad-courtyard-cafe.jpg",
    alt: "An outdoor cafe in Hyderabad with wooden furniture, yellow walls and potted plants",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAAsDASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAMEAQL/xAAhEAACAgICAQUAAAAAAAAAAAABAgADBBESISIUMUFhcf/EABcBAAMBAAAAAAAAAAAAAAAAAAABAwT/xAAXEQEBAQEAAAAAAAAAAAAAAAABABEi/9oADAMBAAIRAxEAPwB3qF4W1oSrqCAv1IFz8xRxQgKPYEbnTZV1VZD4+2cnZBjcfJpalTZwDfIYdzN1tdDKiwCh+I8ge/LvU00KTssxP7CEGZf/2Q==",
    credit: "Photo by Mayank Dixit on Pexels (Pexels License)",
  },
  {
    path: "/media/restaurants/modern-indian-restaurant.jpg",
    alt: "A contemporary Indian restaurant interior with patterned tiles and warm pendant lighting",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA8DASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAAQFAwb/xAAhEAACAgEEAgMAAAAAAAAAAAABAgMRAAQSITETIjJhkf/EABYBAQEBAAAAAAAAAAAAAAAAAAIAA//EABgRAQEAAwAAAAAAAAAAAAAAAAABAhFB/9oADAMBAAIRAxEAPwDngjhSAGD3VWc3MdLtvew7OOSvGkbK1nUSfEfWJzMYW3tGQrDkX1g60l2smKLToBHEnr0WFn9ybrT5uX7wwypYv//Z",
    credit: "Photo by Lakshmi RJ on Pexels (Pexels License)",
  },
  {
    path: "/media/restaurants/ornate-arches-dining.jpg",
    alt: "An Indian restaurant dining room framed by ornate carved arches",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA8DASIAAhEBAxEB/8QAGAAAAgMAAAAAAAAAAAAAAAAAAAQBAwX/xAAiEAACAQMEAgMAAAAAAAAAAAABAgADETEEEkFRBRMhccH/xAAVAQEBAAAAAAAAAAAAAAAAAAABA//EABURAQEAAAAAAAAAAAAAAAAAAAAh/9oADAMBAAIRAxEAPwBxT3TKm+MgyGIsWUMRf5vFNL5HeHZ91lJYEcAy6jrKVYOEckA9ZklayQoXS1GUbTY4+4rRqN7WN+P2EIh//9k=",
    credit: "Photo by AbsoluteAbhi on Pexels (Pexels License)",
  },
  {
    path: "/media/restaurants/pune-vintage-corner.jpg",
    alt: "A cafe corner in Pune hung with vintage photo frames above a banquette",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA8DASIAAhEBAxEB/8QAGQAAAgMBAAAAAAAAAAAAAAAAAAUBAgME/8QAIRAAAQUAAgEFAAAAAAAAAAAAAQACAwQREiExBRMyYZH/xAAVAQEBAAAAAAAAAAAAAAAAAAADAv/EABgRAAMBAQAAAAAAAAAAAAAAAAABAkEh/9oADAMBAAIRAxEAPwBBXpzWc9lnL63Fd3pdo8sj+J7wha07EcUQaXNBPntdM1xzY80AE6idUnwRTIorsD5MPhS8nrs/qEJNIw//2Q==",
    credit: "Photo by Dhananjay Shinde on Pexels (Pexels License)",
  },
  {
    path: "/media/restaurants/warm-bar-shelf-glow.jpg",
    alt: "A cosy bar interior with warm lighting over a well-stocked back shelf",
    blur: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAUAA0DASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAAIEA//EACIQAAICAgEDBQAAAAAAAAAAAAECAxEABDEFIUESE1Fxgf/EABcBAAMBAAAAAAAAAAAAAAAAAAABAgP/xAAYEQEBAQEBAAAAAAAAAAAAAAABABECEv/aAAwDAQACEQMRAD8Ak1hMymol7qEZV8Dm8mi6TNts7QopAq7aqyTWnZAACxN8A5q+05qj6f09/vIBG0evRJDAhZbv5xDGvuMPA4www12eGF//2Q==",
    credit: "Photo by Okan Yasar on Pexels (Pexels License)",
  },
];

export const seedImages = {
  events: eventImages,
  artists: artistImages,
  venues: venueImages,
  restaurants: restaurantImages,
} as const;

export type SeedImageCategory = keyof typeof seedImages;

/** FNV-1a. Small, stable, and dependency-free — the same key always lands on the same image. */
function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministically pick an image for a row.
 *
 * Pass a stable key — a database id, slug or list index — NOT `Math.random()`:
 * the same key always returns the same photo, so posters do not change between
 * renders. Numbers are used directly (mod length); strings are hashed.
 *
 * ```ts
 * <img src={pickSeedImage('events', event.id).path}
 *      alt={pickSeedImage('events', event.id).alt} />
 * ```
 */
export function pickSeedImage(
  category: SeedImageCategory,
  key: string | number,
): SeedImage {
  const list = seedImages[category];
  const n = typeof key === "number" ? Math.trunc(key) : hashKey(key);
  return list[((n % list.length) + list.length) % list.length];
}

/** Convenience wrapper when only the URL is needed. */
export function pickSeedImagePath(
  category: SeedImageCategory,
  key: string | number,
): string {
  return pickSeedImage(category, key).path;
}

/** Every image across all categories, in manifest order. */
export const allSeedImages: SeedImage[] = [
  ...eventImages,
  ...artistImages,
  ...venueImages,
  ...restaurantImages,
];
