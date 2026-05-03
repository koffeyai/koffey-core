import React, { useState, useCallback, useEffect } from 'react';
import { Search, X, User, Building, Mail, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchResult {
  id: string;
  type: 'user' | 'organization' | 'profile';
  title: string;
  subtitle: string;
  metadata?: string;
  avatar?: string;
}

export const GlobalSearchBar: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  
  const debouncedQuery = useDebounce(query, 300);

  const searchAll = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const searchTerm = `%${searchQuery.toLowerCase()}%`;
      
      // Search users across all organizations  
      const { data: users } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          role
        `)
        .or(`email.ilike.${searchTerm},full_name.ilike.${searchTerm}`)
        .limit(10);

      // Search organizations
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name, domain, created_at')
        .or(`name.ilike.${searchTerm},domain.ilike.${searchTerm}`)
        .limit(10);

      const searchResults: SearchResult[] = [];

      // Add user results
      if (users) {
        users.forEach(user => {
          searchResults.push({
            id: user.id,
            type: 'user',
            title: user.full_name || user.email || 'Unknown User',
            subtitle: user.role || 'No Role',
            metadata: user.email
          });
        });
      }

      // Add organization results
      if (orgs) {
        orgs.forEach(org => {
          searchResults.push({
            id: org.id,
            type: 'organization',
            title: org.name,
            subtitle: org.domain || 'No domain',
            metadata: new Date(org.created_at).toLocaleDateString()
          });
        });
      }

      setResults(searchResults);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getUserIdsFromEmail = async (email: string): Promise<string> => {
    try {
      // For now, just search by the email string itself
      return `"${email}"`;
    } catch {
      return '""';
    }
  };

  useEffect(() => {
    searchAll(debouncedQuery);
  }, [debouncedQuery, searchAll]);

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'user':
        return <User className="h-4 w-4" />;
      case 'organization':
        return <Building className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getResultBadgeColor = (type: string) => {
    switch (type) {
      case 'user':
        return 'bg-blue-100 text-blue-800';
      case 'organization':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search users, organizations..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          className="pl-10 pr-10"
        />
        {query && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Search Results */}
      {showResults && (query.length >= 2 || results.length > 0) && (
        <Card className="absolute top-full left-0 right-0 mt-1 z-50 max-h-96 overflow-y-auto">
          <CardContent className="p-2">
            {isLoading ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Searching...
              </div>
            ) : results.length === 0 && query.length >= 2 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No results found for "{query}"
              </div>
            ) : (
              <div className="space-y-1">
                {results.map((result) => (
                  <div
                    key={`${result.type}-${result.id}`}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                    onClick={() => {
                      setShowResults(false);
                    }}
                  >
                    <div className="flex-shrink-0">
                      {getResultIcon(result.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {result.title}
                        </span>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${getResultBadgeColor(result.type)}`}
                        >
                          {result.type}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {result.subtitle}
                      </div>
                      {result.metadata && (
                        <div className="text-xs text-muted-foreground truncate">
                          {result.metadata}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Click outside to close */}
      {showResults && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowResults(false)}
        />
      )}
    </div>
  );
};